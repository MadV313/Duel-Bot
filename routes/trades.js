// routes/trade.js
// Trade sessions & limits
// Mount at ROOT so paths match spec exactly:
//   POST /trade/start
//   GET  /trade/:session/state
//   POST /trade/:session/select
//   POST /trade/:session/decision
//   GET  /me/:token/trade/limits
//
// Factory router so we can DM via Discord client from server.js

import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import {
  resolveUserIdByToken,
  pad3,
} from '../utils/deckUtils.js';

const linkedDecksPath   = path.resolve('./data/linked_decks.json');
const tradesPath        = path.resolve('./data/trades.json');
const tradeLimitsPath   = path.resolve('./data/trade_limits.json');

const MAX_PER_DAY = 3;
const SESSION_TTL_HOURS = 24;

function todayStr() {
  return new Date().toISOString().slice(0,10);
}
function randomId(len=24) {
  return crypto.randomBytes(Math.ceil((len*3)/4)).toString('base64url').slice(0, len);
}
async function readJson(file, fb) {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')); } catch { return fb; }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function clampCards(cards) {
  const set = new Set();
  const out = [];
  for (const c of (cards||[])) {
    const id = pad3(c);
    if (!set.has(id) && out.length < 3) {
      set.add(id);
      out.push(id);
    }
  }
  return out;
}
function incLimit(limits, userId, day) {
  limits[userId] ||= {};
  limits[userId][day] = (limits[userId][day] || 0) + 1;
}
function getUsed(limits, userId, day) {
  return limits?.[userId]?.[day] || 0;
}
function hasExpired(session) {
  if (!session?.expiresAt) return false;
  return Date.now() > new Date(session.expiresAt).getTime();
}

function buildUiLink({ base, token, apiBase, sessionId, stage, partnerName }) {
  const ts = Date.now();
  const qp = new URLSearchParams();
  qp.set('token', token);
  if (apiBase) qp.set('api', apiBase);
  qp.set('mode', 'trade');
  qp.set('session', sessionId);
  qp.set('stage', stage);
  if (partnerName) qp.set('partner', partnerName);
  qp.set('ts', String(ts));
  // point to /index.html explicitly for compatibility
  return `${base.replace(/\/+$/, '')}/index.html?${qp.toString()}`;
}

export default function createTradeRouter(bot) {
  const router = express.Router();

  // POST /trade/start  (bot-only)
  router.post('/trade/start', async (req, res) => {
    try {
      const botKey = req.get('x-bot-key') || req.get('X-Bot-Key');
      const expected = process.env.BOT_API_KEY || '';
      if (!expected || botKey !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { initiatorId, partnerId, apiBase, collectionUiBase } = req.body || {};
      if (!initiatorId || !partnerId) {
        return res.status(400).json({ error: 'Missing initiatorId or partnerId' });
      }
      if (initiatorId === partnerId) {
        return res.status(400).json({ error: 'Cannot trade with yourself.' });
      }

      const [linked, limits] = await Promise.all([
        readJson(linkedDecksPath, {}),
        readJson(tradeLimitsPath, {})
      ]);

      const iniProfile = linked[initiatorId];
      const parProfile = linked[partnerId];
      if (!iniProfile?.token || !parProfile?.token) {
        return res.status(400).json({ error: 'Both users must be linked first.' });
      }

      // Enforce 3/day (initiations)
      const day = todayStr();
      const used = getUsed(limits, initiatorId, day);
      if (used >= MAX_PER_DAY) {
        return res.status(429).json({ error: `Trade limit reached (${MAX_PER_DAY}/day).` });
      }

      const sessionId = randomId(20);
      const now = new Date();
      const session = {
        id: sessionId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_HOURS*3600*1000).toISOString(),
        status: 'active',           // active | accepted | denied | expired
        stage: 'pickMine',          // pickMine → pickTheirs → decision
        initiator: {
          userId: initiatorId,
          token: iniProfile.token,
          name: iniProfile.discordName || initiatorId,
          selection: [],            // up to 3
        },
        partner: {
          userId: partnerId,
          token: parProfile.token,
          name: parProfile.discordName || partnerId,
          selection: [],            // up to 3
        }
      };

      // Persist
      const trades = await readJson(tradesPath, {});
      trades[sessionId] = session;
      await writeJson(tradesPath, trades);

      // Increment initiator daily usage (reserve a slot)
      incLimit(limits, initiatorId, day);
      await writeJson(tradeLimitsPath, limits);

      // Build link for initiator
      const uiBase = (collectionUiBase ||
        process.env.COLLECTION_UI_BASE ||
        process.env.COLLECTION_UI ||
        'https://madv313.github.io/Card-Collection-UI');

      const initLink = buildUiLink({
        base: uiBase,
        token: iniProfile.token,
        apiBase,
        sessionId,
        stage: 'pickMine',
        partnerName: parProfile.discordName || ''
      });

      // DM initiator a convenience link
      try {
        const user = await bot.users.fetch(initiatorId);
        await user.send({
          content: `🔄 **Trade started with <@${partnerId}>**\nSelect up to 3 cards to offer: ${initLink}`
        });
      } catch (e) {
        console.warn('[trade] Failed to DM initiator:', e?.message || e);
      }

      return res.json({
        ok: true,
        sessionId,
        stage: session.stage,
        initiatorLink: initLink,
        message: 'Trade session created.'
      });
    } catch (e) {
      console.error('[trade/start] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /trade/:session/state
  router.get('/trade/:session/state', async (req, res) => {
    try {
      const { session } = req.params;
      const trades = await readJson(tradesPath, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });

      if (hasExpired(s) && s.status === 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJson(tradesPath, trades);
      }

      // Return safe view
      const payload = {
        ok: true,
        id: s.id,
        status: s.status,
        stage: s.stage,
        expiresAt: s.expiresAt,
        initiator: {
          name: s.initiator.name,
          userId: s.initiator.userId,
          selection: s.initiator.selection,
        },
        partner: {
          name: s.partner.name,
          userId: s.partner.userId,
          selection: s.partner.selection,
        }
      };
      return res.json(payload);
    } catch (e) {
      console.error('[trade/state] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /trade/:session/select
  // Body: { token, cards: ["001","..."] }
  router.post('/trade/:session/select', async (req, res) => {
    try {
      const { session } = req.params;
      const { token, cards } = req.body || {};
      if (!token || !Array.isArray(cards)) {
        return res.status(400).json({ error: 'Missing token or cards' });
      }

      const trades = await readJson(tradesPath, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });
      if (hasExpired(s) || s.status !== 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJson(tradesPath, trades);
        return res.status(410).json({ error: 'Session expired' });
      }

      const idFromToken = await resolveUserIdByToken(token);
      if (!idFromToken) return res.status(403).json({ error: 'Invalid token' });

      const sel = clampCards(cards);

      // Initiator selects
      if (s.stage === 'pickMine') {
        if (idFromToken !== s.initiator.userId) {
          return res.status(403).json({ error: 'Not initiator turn' });
        }
        s.initiator.selection = sel;
        s.stage = 'pickTheirs';
        trades[session] = s;
        await writeJson(tradesPath, trades);

        // DM partner to review & pick
        try {
          const uiBase = (process.env.COLLECTION_UI_BASE ||
            process.env.COLLECTION_UI ||
            'https://madv313.github.io/Card-Collection-UI');
          const apiBase = process.env.API_BASE || process.env.api_base || '';
          const partnerLink = buildUiLink({
            base: uiBase,
            token: s.partner.token,
            apiBase,
            sessionId: s.id,
            stage: 'pickTheirs',
            partnerName: s.initiator.name
          });
          const partnerUser = await bot.users.fetch(s.partner.userId);
          await partnerUser.send({
            content: `📨 **Trade offer from <@${s.initiator.userId}>**\nSelect up to 3 cards you want to trade in return: ${partnerLink}`
          });
        } catch (e) {
          console.warn('[trade/select] Failed to DM partner:', e?.message || e);
        }

        return res.json({
          ok: true,
          stage: s.stage,
          initiator: { selection: s.initiator.selection },
          partner: { selection: s.partner.selection },
          message: 'Your selection is saved. Waiting for partner.'
        });
      }

      // Partner selects
      if (s.stage === 'pickTheirs') {
        if (idFromToken !== s.partner.userId) {
          return res.status(403).json({ error: 'Not partner turn' });
        }
        s.partner.selection = sel;
        s.stage = 'decision'; // partner will decide accept/deny after viewing summary
        trades[session] = s;
        await writeJson(tradesPath, trades);

        return res.json({
          ok: true,
          stage: s.stage,
          initiator: { selection: s.initiator.selection },
          partner: { selection: s.partner.selection },
          message: 'Your selection is saved. Review and decide.'
        });
      }

      return res.status(400).json({ error: 'Invalid stage for selection' });
    } catch (e) {
      console.error('[trade/select] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /trade/:session/decision
  // Body: { token, decision: "accept"|"deny" }
  router.post('/trade/:session/decision', async (req, res) => {
    try {
      const { session } = req.params;
      const { token, decision } = req.body || {};
      if (!token || !decision) return res.status(400).json({ error: 'Missing token or decision' });
      if (!['accept','deny'].includes(String(decision))) {
        return res.status(400).json({ error: 'Invalid decision' });
      }

      const trades = await readJson(tradesPath, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });
      if (hasExpired(s) || s.status !== 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJson(tradesPath, trades);
        return res.status(410).json({ error: 'Session expired' });
      }

      const userId = await resolveUserIdByToken(token);
      if (!userId || userId !== s.partner.userId) {
        return res.status(403).json({ error: 'Only partner can decide' });
      }
      if (s.stage !== 'decision') {
        return res.status(400).json({ error: 'Not in decision stage' });
      }

      if (decision === 'deny') {
        s.status = 'denied';
        trades[session] = s;
        await writeJson(tradesPath, trades);

        // DM initiator outcome
        try {
          const u = await bot.users.fetch(s.initiator.userId);
          await u.send(`❌ Your trade with <@${s.partner.userId}> was **denied**.`);
        } catch {}
        return res.json({ ok: true, status: s.status, message: 'Trade denied.' });
      }

      // ACCEPT: validate ownership, then swap
      const linked = await readJson(linkedDecksPath, {});
      const A = linked[s.initiator.userId];
      const B = linked[s.partner.userId];
      if (!A?.collection || !B?.collection) {
        return res.status(400).json({ error: 'Profiles unavailable.' });
      }
      const colA = { ...A.collection };
      const colB = { ...B.collection };

      const giveA = s.initiator.selection; // A → B
      const giveB = s.partner.selection;   // B → A

      // Validate A owns giveA
      for (const id of giveA) {
        if ((colA[id] || 0) <= 0) {
          return res.status(409).json({ error: `Initiator no longer owns #${id}` });
        }
      }
      // Validate B owns giveB
      for (const id of giveB) {
        if ((colB[id] || 0) <= 0) {
          return res.status(409).json({ error: `Partner no longer owns #${id}` });
        }
      }

      // Perform swap
      for (const id of giveA) {
        colA[id] = (colA[id] || 0) - 1;
        if (colA[id] <= 0) delete colA[id];
        colB[id] = (colB[id] || 0) + 1;
      }
      for (const id of giveB) {
        colB[id] = (colB[id] || 0) - 1;
        if (colB[id] <= 0) delete colB[id];
        colA[id] = (colA[id] || 0) + 1;
      }

      A.collection = colA;
      B.collection = colB;

      await writeJson(linkedDecksPath, linked);

      s.status = 'accepted';
      trades[session] = s;
      await writeJson(tradesPath, trades);

      // Notify both
      try {
        const ini = await bot.users.fetch(s.initiator.userId);
        await ini.send(`✅ Trade with <@${s.partner.userId}> **accepted**. Cards have been swapped.`);
      } catch {}
      try {
        const par = await bot.users.fetch(s.partner.userId);
        await par.send(`✅ Trade with <@${s.initiator.userId}> **accepted**. Cards have been swapped.`);
      } catch {}

      return res.json({
        ok: true,
        status: s.status,
        collection: colB, // return *partner* latest if caller is partner; front-end will refresh via /me/:token/collection anyway
        message: 'Trade accepted and applied.'
      });
    } catch (e) {
      console.error('[trade/decision] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /me/:token/trade/limits
  router.get('/me/:token/trade/limits', async (req, res) => {
    try {
      const { token } = req.params;
      const userId = await resolveUserIdByToken(String(token||''));
      if (!userId) return res.status(404).json({ error: 'Invalid token' });

      const limits = await readJson(tradeLimitsPath, {});
      const day = todayStr();
      const used = getUsed(limits, userId, day);
      const remaining = Math.max(0, MAX_PER_DAY - used);
      return res.json({ ok: true, userId, day, usedToday: used, remaining, maxPerDay: MAX_PER_DAY });
    } catch (e) {
      console.error('[trade/limits] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
