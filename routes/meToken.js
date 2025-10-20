// routes/meToken.js
// Token-aware endpoints that resolve :token → userId and return
// collection + stats for the linked player.
// Adds: POST /me/:token/sell   (sell up to 5 cards per 24h, decrements collection, credits coins)

import express from 'express';
import {
  resolveUserIdByToken,
  getPlayerCollectionMap,
  getUserStats,
  getPlayerProfileByUserId,
  loadMaster,
  pad3,
} from '../utils/deckUtils.js';

import { load_file, save_file } from '../utils/storageClient.js';

const router = express.Router();

/* ---------------------------------- helpers ---------------------------------- */
// Remote JSON filenames (persistent storage) — all under data/
const LINKED_DECKS_FILE = 'data/linked_decks.json';
const COIN_BANK_FILE    = 'data/coin_bank.json';
const SELLS_BY_DAY_FILE = 'data/sells_by_day.json'; // { [userId]: { 'YYYY-MM-DD': numberSold } }

// Correct coin values per rarity
const SELL_VALUES = {
  Common:    0.5,
  Uncommon:  1,
  Rare:      2,
  Legendary: 3,
  Unique:    3, // adjust if you want a special value
};

const DAILY_LIMIT = 5; // total cards/day (sum of qty)

async function readJsonRemote(name, fallback) {
  try {
    // load_file already returns a parsed JS object via storageClient
    const obj = await load_file(name);
    return (obj && typeof obj === 'object') ? obj : fallback;
  } catch {
    return fallback;
  }
}
async function writeJsonRemote(name, data) {
  // save_file expects a JS object; storageClient will JSON.stringify for us
  await save_file(name, data);
}

function todayKeyUTC(d = new Date()) {
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
 */
router.post('/me/:token/sell', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = await resolveUserIdByToken(token);
    if (!userId) return res.status(404).json({ error: 'Invalid token' });

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No items provided' });

    // Normalize & coalesce
    const coalesced = {};
    for (const raw of items) {
      const id = pad3(String(raw.number || raw.card_id || raw.id || '').replace('#', ''));
      const qty = Math.max(1, parseInt(raw.qty ?? raw.quantity ?? 0, 10) || 0);
      if (!id || id === '000' || !qty) continue;
      coalesced[id] = (coalesced[id] || 0) + qty;
    }
    const normalized = Object.entries(coalesced).map(([id, qty]) => ({ id, qty }));
    if (!normalized.length) return res.status(400).json({ error: 'Invalid items' });

    const dayKey = todayKeyUTC();
    const resetAtISO = nextUTCmidnightISO();

    const [linked, bank, sellsByDay, master] = await Promise.all([
      readJsonRemote(LINKED_DECKS_FILE, {}),
      readJsonRemote(COIN_BANK_FILE, {}),
      readJsonRemote(SELLS_BY_DAY_FILE, {}),
      loadMaster()
    ]);

    const profile = linked[userId];
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const userSellMap = sellsByDay[userId] || {};
    const soldToday = Number(userSellMap[dayKey] || 0);
    const requestedTotal = normalized.reduce((a, b) => a + b.qty, 0);

    if (soldToday + requestedTotal > DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Daily sell limit reached',
        soldToday,
        soldRemaining: Math.max(0, DAILY_LIMIT - soldToday),
        limit: DAILY_LIMIT,
        resetAtISO
      });
    }

    const metaById = new Map(master.map(c => [pad3(c.card_id), c]));

    // validate ownership
    const collection = { ...(profile.collection || {}) };
    for (const { id, qty } of normalized) {
      const owned = Number(collection[id] || 0);
      if (owned < qty) {
        return res.status(422).json({ error: `Insufficient quantity for ${id}`, id, owned, requested: qty });
      }
    }

    // apply changes + compute credit
    let credited = 0;
    for (const { id, qty } of normalized) {
      const newQty = Number(collection[id] || 0) - qty;
      if (newQty > 0) collection[id] = newQty;
      else delete collection[id];

      const rarity = metaById.get(id)?.rarity || 'Common';
      const value = SELL_VALUES[rarity] ?? SELL_VALUES.Common;
      credited += value * qty;
    }

    // persist collection and coins
    profile.collection = collection;
    const prevBalance = Number((bank?.[userId]) || 0);
    const newBalance = prevBalance + credited;

    const bankUpdate = { ...(bank || {}) };
    bankUpdate[userId] = newBalance;

    // mirror for UIs that read linked_decks.json
    profile.coins = newBalance;
    profile.lastCoinsUpdatedAt = new Date().toISOString();
    if (!profile.discordId) profile.discordId = userId;

    const linkedUpdate = { ...(linked || {}) };
    linkedUpdate[userId] = profile;

    const newUserSellMap = { ...(userSellMap || {}) };
    newUserSellMap[dayKey] = soldToday + requestedTotal;

    const sellsByDayUpdate = { ...(sellsByDay || {}) };
    sellsByDayUpdate[userId] = newUserSellMap;

    await Promise.all([
      writeJsonRemote(LINKED_DECKS_FILE, linkedUpdate),
      writeJsonRemote(COIN_BANK_FILE, bankUpdate),
      writeJsonRemote(SELLS_BY_DAY_FILE, sellsByDayUpdate),
    ]);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      credited,
      balance: newBalance,
      soldToday: newUserSellMap[dayKey],
      soldRemaining: Math.max(0, DAILY_LIMIT - newUserSellMap[dayKey]),
      resetAtISO,
      collection
    });
  } catch (e) {
    console.error('[meToken] sell error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
