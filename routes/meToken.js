// routes/meToken.js
// Token-aware endpoints that resolve :token → userId and return
// collection + stats for the linked player.
// Adds: POST /me/:token/sell   (sell up to 5 cards per 24h, decrements collection, credits coins)

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import {
  resolveUserIdByToken,
  getPlayerCollectionMap,
  getUserStats,
  getPlayerProfileByUserId,
  loadMaster,
  pad3,
} from '../utils/deckUtils.js';

const router = express.Router();

/* ---------------------------------- helpers ---------------------------------- */
const linkedDecksPath  = path.resolve('data', 'linked_decks.json');
const coinBankPath     = path.resolve('data', 'coin_bank.json');
const sellsByDayPath   = path.resolve('data', 'sells_by_day.json'); // { [userId]: { 'YYYY-MM-DD': numberSold } }

// Default coin values per rarity (tweak as you like or later move to config)
const SELL_VALUES = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Legendary: 5,
  Unique: 8,
};

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function todayKeyUTC(d = new Date()) {
  // Use UTC date to keep things simple and deterministic
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function nextUTCmidnightISO(d = new Date()) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  return next.toISOString();
}

/* ------------------------------- GET collection ------------------------------ */
/**
 * GET /me/:token/collection
 * -> [{ number: "001", owned: 2, name, rarity, type, image }, ...]
 */
router.get('/me/:token/collection', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [collectionMap, master] = await Promise.all([
      getPlayerCollectionMap(userId),
      loadMaster()
    ]);

    const byId = new Map(master.map(c => [pad3(c.card_id), c]));
    const payload = Object.entries(collectionMap)
      .filter(([id]) => id !== '000')
      .map(([id, owned]) => {
        const meta = byId.get(id);
        return {
          number: id,
          owned: Number(owned) || 0,
          ...(meta ? {
            name: meta.name,
            rarity: meta.rarity,
            type: meta.type,
            image: meta.image
          } : {})
        };
      })
      .sort((a, b) => parseInt(a.number) - parseInt(b.number));

    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (e) {
    console.error('[meToken] collection error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/* ---------------------------------- GET stats --------------------------------- */
/**
 * GET /me/:token/stats
 * -> { userId, discordName, coins, wins, losses }
 */
router.get('/me/:token/stats', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [stats, profile] = await Promise.all([
      getUserStats(userId),
      getPlayerProfileByUserId(userId)
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      userId,
      discordName: profile?.discordName || '',
      coins: stats.coins || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0
    });
  } catch (e) {
    console.error('[meToken] stats error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/* ---------------------------- Compat GET ?token= ------------------------------ */
/**
 * Compat: GET /userStatsToken?token=...
 * Same as /me/:token/stats but with a query param.
 */
router.get('/userStatsToken', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const userId = await resolveUserIdByToken(String(token));
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const [stats, profile] = await Promise.all([
      getUserStats(userId),
      getPlayerProfileByUserId(userId)
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      userId,
      discordName: profile?.discordName || '',
      coins: stats.coins || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0
    });
  } catch (e) {
    console.error('[meToken] userStatsToken error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/* --------------------------------- POST sell --------------------------------- */
/**
 * POST /me/:token/sell
 * Body: { items: [ { number:"001", qty:2 }, ... ] }
 *
 * Rules:
 *  - Resolve token → userId
 *  - Validate ids/qty
 *  - Enforce daily limit: max 5 cards per UTC day (sum of qty)
 *  - Decrement collection counts
 *  - Credit coins per rarity using SELL_VALUES
 *  - Persist to linked_decks.json, coin_bank.json, sells_by_day.json
 *
 * Response 200:
 *  {
 *    ok: true,
 *    credited: 7,
 *    balance: 42,
 *    soldToday: 5,
 *    soldRemaining: 0,
 *    resetAtISO: "...",
 *    collection: { "001": 3, "002": 0, ... }   // zero-qty keys omitted
 *  }
 */
router.post('/me/:token/sell', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Normalize items
    const normalized = items.map(it => ({
      id: pad3(String(it.number || it.card_id || it.id || '').replace('#', '')),
      qty: Math.max(1, parseInt(it.qty ?? it.quantity ?? 0, 10) || 0),
    })).filter(it => it.id && it.qty > 0 && it.id !== '000');

    if (!normalized.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    // Daily limit bookkeeping
    const dayKey = todayKeyUTC();
    const resetAtISO = nextUTCmidnightISO();

    const [linked, bank, sellsByDay, master] = await Promise.all([
      readJson(linkedDecksPath, {}),
      readJson(coinBankPath, {}),
      readJson(sellsByDayPath, {}),
      loadMaster()
    ]);

    const profile = linked[userId];
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // current daily count
    const userSellMap = sellsByDay[userId] || {};
    const soldToday = Number(userSellMap[dayKey] || 0);
    const requestedTotal = normalized.reduce((a, b) => a + b.qty, 0);

    if (requestedTotal <= 0) {
      return res.status(400).json({ error: 'Requested quantity is zero' });
    }

    const DAILY_LIMIT = 5;
    if (soldToday + requestedTotal > DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Daily sell limit reached',
        soldToday,
        soldRemaining: Math.max(0, DAILY_LIMIT - soldToday),
        limit: DAILY_LIMIT,
        resetAtISO
      });
    }

    // Build master lookup
    const metaById = new Map(master.map(c => [pad3(c.card_id), c]));

    // Validate ownership and compute credit
    const collection = { ...(profile.collection || {}) };
    let credited = 0;

    for (const { id, qty } of normalized) {
      const owned = Number(collection[id] || 0);
      if (owned < qty) {
        return res.status(422).json({ error: `Insufficient quantity for ${id}`, id, owned, requested: qty });
      }
    }

    for (const { id, qty } of normalized) {
      // Decrement collection
      const newQty = Number(collection[id] || 0) - qty;
      if (newQty > 0) collection[id] = newQty;
      else delete collection[id];

      // Credit coins by rarity
      const meta = metaById.get(id);
      const rarity = meta?.rarity || 'Common';
      const value = SELL_VALUES[rarity] ?? SELL_VALUES.Common;
      credited += value * qty;
    }

    // Persist collection & coin bank & daily counter
    profile.collection = collection;
    linked[userId] = profile;

    const prevBalance = Number(bank[userId] || 0);
    const newBalance = prevBalance + credited;
    bank[userId] = newBalance;

    userSellMap[dayKey] = soldToday + requestedTotal;
    sellsByDay[userId] = userSellMap;

    await Promise.all([
      writeJson(linkedDecksPath, linked),
      writeJson(coinBankPath, bank),
      writeJson(sellsByDayPath, sellsByDay),
    ]);

    // Respond with updated state
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      credited,
      balance: newBalance,
      soldToday: userSellMap[dayKey],
      soldRemaining: Math.max(0, DAILY_LIMIT - userSellMap[dayKey]),
      resetAtISO,
      collection
    });
  } catch (e) {
    console.error('[meToken] sell error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
