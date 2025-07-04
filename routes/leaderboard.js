// routes/leaderboard.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const statsPath = path.resolve('./data/player_data.json');

/**
 * GET /leaderboard
 * Returns top duelists ranked by wins (tiebreaker: fewer losses)
 */
router.get('/', async (req, res) => {
  try {
    const raw = await fs.readFile(statsPath, 'utf-8');
    const stats = JSON.parse(raw);

    const leaderboard = Object.entries(stats)
      .map(([userId, record]) => ({
        userId,
        wins: record.wins ?? 0,
        losses: record.losses ?? 0
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      });

    return res.status(200).json({ leaderboard });
  } catch (err) {
    console.error('❌ Failed to load leaderboard:', err);
    return res.status(500).json({ error: 'Failed to load leaderboard.' });
  }
});

export default router;
