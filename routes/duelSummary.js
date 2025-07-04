// routes/duelSummary.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// GET /duelSummary/:duelId — Fetch summary by duelId
router.get('/:duelId', async (req, res) => {
  const { duelId } = req.params;

  try {
    const summaryPath = path.join(process.cwd(), 'data', 'summaries', `${duelId}.json`);
    const raw = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(raw);

    return res.status(200).json(summary);
  } catch (err) {
    console.error("❌ Summary fetch error:", err);
    return res.status(404).json({ error: 'Summary not found.' });
  }
});

// POST /duelSummary/save — Save new summary after duel ends
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

  const summaryDir = path.join(process.cwd(), 'data', 'summaries');
  const filePath = path.join(summaryDir, `${summary.duelId}.json`);

  try {
    await fs.mkdir(summaryDir, { recursive: true });

    // Check for duplicate
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'Summary already exists.' });
    } catch {
      // File does not exist, proceed to write
    }

    await fs.writeFile(filePath, JSON.stringify(summary, null, 2));
    return res.status(200).json({ message: '✅ Summary saved.' });
  } catch (err) {
    console.error('❌ Error saving summary:', err);
    return res.status(500).json({ error: 'Failed to save summary.' });
  }
});

export default router;
