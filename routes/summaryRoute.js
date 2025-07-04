// routes/summaryRoute.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

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
    const summaryPath = path.join(process.cwd(), 'data', 'summaries', `${duelId}.json`);
    const raw = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(raw);

    res.status(200).json(summary);
  } catch (err) {
    console.error(`❌ Failed to load summary for duelId "${duelId}":`, err.message);
    res.status(404).json({ error: 'Summary not found.' });
  }
});

export default router;
