// routes/meToken.js
// Token-aware endpoints that resolve :token → userId and return
// collection + stats for the linked player.

import express from 'express';
import {
  resolveUserIdByToken,
  getPlayerCollectionMap,
  getUserStats,
  getPlayerProfileByUserId,
  loadMaster,
  pad3,
} from '../utils/deckUtils.js';

const router = express.Router();

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

    res.json(payload);
  } catch (e) {
    console.error('[meToken] collection error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

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

export default router;
