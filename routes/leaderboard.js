// routes/leaderboard.js

import express from 'express';
import { load_file } from '../utils/storageClient.js';

const router = express.Router();

/**
 * GET /leaderboard
 * Returns top duelists ranked by wins (tiebreaker: fewer losses)
 */
router.get('/', async (req, res) => {
  try {
    const raw = await load_file('player_data.json'); // persistent storage
    const stats = JSON.parse(raw || '{}');

    const leaderboard = Object.entries(stats)
      .map(([userId, record]) => ({
        userId,
        wins: record?.wins ?? 0,
        losses: record?.losses ?? 0
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
