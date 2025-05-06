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

  try {
    const filePath = path.resolve(`./data/summarys/${duelId}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    const summary = JSON.parse(raw);

    return res.status(200).json(summary);
  } catch (err) {
    console.error(`Failed to load summary for duelId ${duelId}:`, err);
    return res.status(404).json({ error: 'Summary not found.' });
  }
});

export default router;
