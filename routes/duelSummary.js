// routes/duelSummary.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Load summary data by duelId
router.get('/:duelId', async (req, res) => {
  const { duelId } = req.params;

  try {
    const summaryPath = path.join(process.cwd(), 'data', 'summaries', `${duelId}.json`);
    const raw = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(raw);

    res.status(200).json(summary);
  } catch (err) {
    console.error("Summary fetch error:", err);
    res.status(404).json({ error: 'Summary not found.' });
  }
});

export default router;
