// routes/summaryRoute.js

import express from 'express';
import { load_file } from '../utils/storageClient.js';

const router = express.Router();

/**
 * GET /summary/:duelId
 * Serves a summary JSON object for a completed duel.
 */
router.get('/summary/:duelId', async (req, res) => {
  const { duelId } = req.params;

  if (!duelId || duelId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid duel ID.' });
  }

  try {
    // Load from persistent storage instead of local fs
    const key = `data/summaries/${duelId}.json`;
    const raw = await load_file(key);
    const summary = JSON.parse(raw);

    res.status(200).json(summary);
  } catch (err) {
    console.error(`❌ Failed to load summary for duelId "${duelId}":`, err?.message || err);
    res.status(404).json({ error: 'Summary not found.' });
  }
});

export default router;
