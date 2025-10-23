// routes/trade.js
// Trade sessions & limits
// Mount at ROOT so paths match spec exactly:
//   POST /trade/start
//   GET  /trade/:session/state
//   POST /trade/:session/select
//   POST /trade/:session/decision
//   GET  /me/:token/trade/limits
//   NEW: GET /trade/:session/collections?token=...   (session-gated view of both collections)
//   NEW: GET /trade/:session/summary?token=...       (summary of both selections with metadata)
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
import { load_file, save_file } from '../utils/storageClient.js';

const LINKED_DECKS_FILE = 'data/linked_decks.json';
const TRADES_FILE       = 'data/trades.json';
const TRADE_LIMITS_FILE = 'data/trade_limits.json';

const cardListPath      = path.resolve('./logic/CoreMasterReference.json'); // static asset

const MAX_PER_DAY = 3;
const SESSION_TTL_HOURS = 24;

function todayStr() {
  return new Date().toISOString().slice(0,10);
}
function randomId(len=24) {
  return crypto.randomBytes(Math.ceil((len*3)/4)).toString('base64url').slice(0, len);
}

// ---- Persistent storage helpers (remote) ----
async function readJsonRemote(name, fb) {
  try {
    const raw = await load_file(name);
    return raw ? JSON.parse(raw) : fb;
  } catch {
    return fb;
  }
}
async function writeJsonRemote(name, data) {
  await save_file(name, JSON.stringify(data, null, 2));
}

// ---- Local read helper for static card master ----
async function readJsonLocal(file, fb) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return fb;
  }
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

// Build a Collection UI link following the UI/cog contract:
// ?mode=trade&tradeSession=<id>&role=<initiator|partner>[&stage=...&partner=...]
function buildUiLink({ base, token, apiBase, sessionId, role, stage, partnerName }) {
  const ts = Date.now();
  const qp = new URLSearchParams();
  qp.set('mode', 'trade');
  qp.set('tradeSession', sessionId);
  if (role) qp.set('role', role);
  if (token) qp.set('token', token);
  if (apiBase) qp.set('api', apiBase);
  if (stage) qp.set('stage', stage);
  if (partnerName) qp.set('partner', partnerName);
  qp.set('ts', String(ts));
  return `${String(base || '').replace(/\/+$/, '')}/index.html?${qp.toString()}`;
}

/* ---------------- Card metadata helpers (for thumbnails/labels) ---------------- */
let __cardIndex = null;
async function loadCardIndex() {
  if (__cardIndex) return __cardIndex;
  const raw = await readJsonLocal(cardListPath, []);
  const list = Array.isArray(raw) ? raw : (raw.cards || []);
  const index = {};
  for (const c of list) {
    const id = pad3(c.card_id);
    index[id] = {
      name: c.name,
      rarity: c.rarity || 'Common',
      type: c.type || '',
      filename: c.filename || `${id}_${String(c.name||'').replace(/[^a-zA-Z0-9._-]/g,'')}_${String(c.type||'').replace(/[^a-zA-Z0-9._-]/g,'')}.png`
    };
  }
  __cardIndex = index;
  return __cardIndex;
}
function metaFor(id, idx) {
  return idx[id] || { name: `#${id}`, rarity: 'Common', type: '', filename: `${id}.png` };
}
function collectionToArray(collection = {}, idx = {}) {
  const out = [];
  for (const [id, qtyRaw] of Object.entries(collection)) {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) continue;
    const m = metaFor(id, idx);
    out.push({ card_id: `#${id}`, id, qty, name: m.name, rarity: m.rarity, filename: m.filename });
  }
  // sort nicely: rarity then id
  out.sort((a, b) => {
    const rOrder = { Legendary: 3, Rare: 2, Uncommon: 1, Common: 0 };
    const dr = (rOrder[b.rarity]||0) - (rOrder[a.rarity]||0);
    if (dr) return dr;
    return a.id.localeCompare(b.id);
  });
  return out;
}

/* ---------------- Bot-key helpers (header/env) ---------------- */
function getBotKeyFromHeaders(req) {
  const direct = req.get('X-Bot-Key') || req.get('x-bot-key');
  if (direct) return direct.trim();
  const auth = req.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
function constantTimeEq(a = '', b = '') {
  const al = a.length, bl = b.length;
  let mismatch = al ^ bl;
  for (let i = 0; i < Math.max(al, bl); i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/* ---------------- Profile token helper ---------------- */
function getProfileToken(profile) {
  if (!profile) return '';
  // Try several plausible fields in case schema differs
  return String(
    profile.token ||
    profile.deckToken ||
    profile.viewerToken ||
    profile.accessToken ||
    ''
  ).trim();
}

export default function createTradeRouter(bot) {
  const router = express.Router();

  // POST /trade/start  (bot-only)
  router.post('/trade/start', async (req, res) => {
    try {
      // ⛓️ Accept X-Bot-Key or Authorization: Bearer ... ; env BOT_API_KEY or BOT_KEY
      const headerKey = getBotKeyFromHeaders(req);
      const expected  = (process.env.BOT_API_KEY || process.env.BOT_KEY || '').trim();

      // helpful diagnostics (appears in Railway logs)
      console.log('[auth/trade/start]', {
        hdr_present: !!headerKey,
        env_present: !!expected,
        eq: headerKey && expected ? constantTimeEq(headerKey, expected) : false,
        hdr_len: headerKey ? headerKey.length : 0,
        env_len: expected ? expected.length : 0
      });

      if (!expected) return res.status(500).json({ error: 'Server BOT key not configured' });
      if (!headerKey || !constantTimeEq(headerKey, expected)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Accept either initiatorToken or initiatorId
      const {
        initiatorToken,
        initiatorId: initiatorIdRaw,
        partnerId: partnerIdRaw,
        apiBase,
        collectionUiBase
      } = req.body || {};

      if (!partnerIdRaw || (!initiatorToken && !initiatorIdRaw)) {
        return res.status(400).json({ error: 'Missing initiator and/or partner.' });
      }

      // Normalize IDs to strings for map lookups
      const partnerId   = String(partnerIdRaw);
      let   initiatorId = initiatorIdRaw ? String(initiatorIdRaw) : '';

      if (initiatorToken && !initiatorId) {
        const resolved = await resolveUserIdByToken(String(initiatorToken));
        if (!resolved) return res.status(400).json({ error: 'Invalid initiator token' });
        initiatorId = String(resolved);
      }
      if (!initiatorId) {
        return res.status(400).json({ error: 'Cannot resolve initiator' });
      }
      if (initiatorId === partnerId) {
        return res.status(400).json({ error: 'Cannot trade with yourself.' });
      }

      const [linked, limits] = await Promise.all([
        readJsonRemote(LINKED_DECKS_FILE, {}),
        readJsonRemote(TRADE_LIMITS_FILE, {})
      ]);

      const iniProfile = linked[initiatorId];
      const parProfile = linked[partnerId];
      const iniToken   = getProfileToken(iniProfile);
      const parToken   = getProfileToken(parProfile);

      // Small diagnostic so we can see which side is missing
      console.log('[trade/start] profiles', {
        initiatorId, partnerId,
        iniFound: !!iniProfile, parFound: !!parProfile,
        iniHasToken: !!iniToken, parHasToken: !!parToken,
      });

      if (!iniProfile || !iniToken) {
        return res.status(400).json({ error: 'Initiator must be linked first.' });
      }
      if (!parProfile || !parToken) {
        return res.status(400).json({ error: 'Partner must be linked first.' });
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
          token: iniToken,
          name: iniProfile.discordName || initiatorId,
          selection: [],            // up to 3 (ids)
        },
        partner: {
          userId: partnerId,
          token: parToken,
          name: parProfile.discordName || partnerId,
          selection: [],            // up to 3 (ids)
        }
      };

      // Persist
      const trades = await readJsonRemote(TRADES_FILE, {});
      trades[sessionId] = session;
      await writeJsonRemote(TRADES_FILE, trades);

      // Increment initiator daily usage (reserve a slot)
      incLimit(limits, initiatorId, day);
      await writeJsonRemote(TRADE_LIMITS_FILE, limits);

      // Build link for initiator (role=initiator)
      const uiBase = (collectionUiBase ||
        process.env.COLLECTION_UI_BASE ||
        process.env.COLLECTION_UI ||
        'https://madv313.github.io/Card-Collection-UI');

      const initLink = buildUiLink({
        base: uiBase,
        token: iniToken,
        apiBase,
        sessionId,
        role: 'initiator',
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
        urlInitiator: initLink,
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
      const trades = await readJsonRemote(TRADES_FILE, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });

      if (hasExpired(s) && s.status === 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJsonRemote(TRADES_FILE, trades);
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

  // NEW: GET /trade/:session/collections?token=...
  // Returns role + both collections (with metadata) for session-gated viewing in UI.
  router.get('/trade/:session/collections', async (req, res) => {
    try {
      const { session } = req.params;
      const { token } = req.query || {};
      if (!token) return res.status(400).json({ error: 'Missing token' });

      const trades = await readJsonRemote(TRADES_FILE, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });

      // Identify which side is requesting
      let role = null;
      if (token === s.initiator.token) role = 'initiator';
      else if (token === s.partner.token) role = 'partner';
      else return res.status(403).json({ error: 'Invalid session token' });

      // Load profiles and card metadata
      const [linked, idx] = await Promise.all([
        readJsonRemote(LINKED_DECKS_FILE, {}),
        loadCardIndex()
      ]);
      const A = linked[s.initiator.userId] || {};
      const B = linked[s.partner.userId] || {};

      const myCol      = role === 'initiator' ? A.collection : B.collection;
      const partnerCol = role === 'initiator' ? B.collection : A.collection;

      return res.json({
        ok: true,
        role,
        status: s.status,
        stage: s.stage,
        me: collectionToArray(myCol || {}, idx),
        partner: collectionToArray(partnerCol || {}, idx)
      });
    } catch (e) {
      console.error('[trade/collections] error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // NEW: GET /trade/:session/summary?token=...
  // Returns both sides’ selections with metadata for a confirmation screen.
  router.get('/trade/:session/summary', async (req, res) => {
    try {
      const { session } = req.params;
      const { token } = req.query || {};
      if (!token) return res.status(400).json({ error: 'Missing token' });

      const trades = await readJsonRemote(TRADES_FILE, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });

      if (![s.initiator.token, s.partner.token].includes(token)) {
        return res.status(403).json({ error: 'Invalid session token' });
      }

      const idx = await loadCardIndex();
      const mapSel = (arr=[]) => arr.map(id => {
        const m = metaFor(id, idx);
        return { card_id: `#${id}`, id, name: m.name, rarity: m.rarity, filename: m.filename };
      });

      return res.json({
        ok: true,
        status: s.status,
        stage: s.stage,
        initiator: {
          userId: s.initiator.userId,
          name: s.initiator.name,
          selection: mapSel(s.initiator.selection)
        },
        partner: {
          userId: s.partner.userId,
          name: s.partner.name,
          selection: mapSel(s.partner.selection)
        }
      });
    } catch (e) {
      console.error('[trade/summary] error:', e);
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

      const trades = await readJsonRemote(TRADES_FILE, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });
      if (hasExpired(s) || s.status !== 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJsonRemote(TRADES_FILE, trades);
        return res.status(410).json({ error: 'Session expired' });
      }

      const idFromToken = await resolveUserIdByToken(token);
      if (!idFromToken) return res.status(403).json({ error: 'Invalid token' });

      const sel = clampCards(cards);

      // Initiator selects their cards
      if (s.stage === 'pickMine') {
        if (idFromToken !== s.initiator.userId) {
          return res.status(403).json({ error: 'Not initiator turn' });
        }
        s.initiator.selection = sel;
        s.stage = 'pickTheirs';
        trades[session] = s;
        await writeJsonRemote(TRADES_FILE, trades);

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
            role: 'partner',
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

      // Partner selects their requested cards
      if (s.stage === 'pickTheirs') {
        if (idFromToken !== s.partner.userId) {
          return res.status(403).json({ error: 'Not partner turn' });
        }
        s.partner.selection = sel;
        s.stage = 'decision'; // partner will decide accept/deny after viewing summary
        trades[session] = s;
        await writeJsonRemote(TRADES_FILE, trades);

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
  // Body: { token, decision: "accept"|"deny" } OR { token, accept: true|false }
  router.post('/trade/:session/decision', async (req, res) => {
    try {
      const { session } = req.params;
      const { token } = req.body || {};
      let { decision } = req.body || {};
      const hasAcceptBool = Object.prototype.hasOwnProperty.call(req.body || {}, 'accept');

      if (!token || (typeof decision === 'undefined' && !hasAcceptBool)) {
        return res.status(400).json({ error: 'Missing token or decision' });
      }

      if (hasAcceptBool) {
        decision = req.body.accept ? 'accept' : 'deny';
      }

      if (!['accept','deny'].includes(String(decision))) {
        return res.status(400).json({ error: 'Invalid decision' });
      }

      const trades = await readJsonRemote(TRADES_FILE, {});
      const s = trades[session];
      if (!s) return res.status(404).json({ error: 'Session not found' });
      if (hasExpired(s) || s.status !== 'active') {
        s.status = 'expired';
        trades[session] = s;
        await writeJsonRemote(TRADES_FILE, trades);
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
        await writeJsonRemote(TRADES_FILE, trades);

        // DM initiator outcome
        try {
          const u = await bot.users.fetch(s.initiator.userId);
          await u.send(`❌ Your trade with <@${s.partner.userId}> was **denied**.`);
        } catch {}
        return res.json({ ok: true, status: s.status, message: 'Trade denied.' });
      }

      // ACCEPT: validate ownership, then swap
      const linked = await readJsonRemote(LINKED_DECKS_FILE, {});
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

      // Perform swap (1 copy per selection)
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

      await writeJsonRemote(LINKED_DECKS_FILE, linked);

      s.status = 'accepted';
      trades[session] = s;
      await writeJsonRemote(TRADES_FILE, trades);

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

      const limits = await readJsonRemote(TRADE_LIMITS_FILE, {});
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
