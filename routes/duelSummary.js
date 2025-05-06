// routes/duelSummary.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// GET summary by duelId
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

// POST new summary after duel ends
router.post('/save', async (req, res) => {
  const summary = req.body;

  if (
    !summary ||
    typeof summary.duelId !== 'string' ||
    typeof summary.winner !== 'string' ||
    typeof summary.players !== 'object' ||
    !['player1', 'player2'].includes(summary.winner)
  ) {
    return res.status(400).json({ error: 'Missing or invalid summary data.' });
  }

  try {
    const summaryDir = path.join(process.cwd(), 'data', 'summaries');
    await fs.mkdir(summaryDir, { recursive: true });

    const filePath = path.join(summaryDir, `${summary.duelId}.json`);
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'Summary already exists.' });
    } catch {
      // Continue only if file does not exist
    }

    await fs.writeFile(filePath, JSON.stringify(summary, null, 2));
    res.status(200).json({ message: 'Summary saved.' });
  } catch (err) {
    console.error('Error saving summary:', err);
    res.status(500).json({ error: 'Failed to save summary.' });
  }
});

export default router;
