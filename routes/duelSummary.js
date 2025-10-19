// routes/duelSummary.js
//
// Fully updated for persistent storage integration
// Uses storageClient.load_file() and save_file() instead of local fs I/O
// Keeps identical API shape and validation logic
// Mounted at: app.use('/duelSummary', duelSummaryRoutes)

import express from 'express';
import path from 'path';
import { load_file, save_file } from '../utils/storageClient.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────
// GET /duelSummary/:duelId — fetch summary by duelId
// ────────────────────────────────────────────────────────────
router.get('/:duelId', async (req, res) => {
  const { duelId } = req.params;
  const summaryFile = `summaries/${duelId}.json`;

  try {
    console.log(`[SUMMARY] Fetching summary from persistent data → ${summaryFile}`);
    const raw = await load_file(summaryFile);
    const summary = JSON.parse(raw);

    return res.status(200).json(summary);
  } catch (err) {
    console.error(`❌ [SUMMARY] Fetch error for ${duelId}:`, err?.message || err);
    return res.status(404).json({ error: 'Summary not found.' });
  }
});

// ────────────────────────────────────────────────────────────
// POST /duelSummary/save — save new summary after duel ends
// ────────────────────────────────────────────────────────────
router.post('/save', async (req, res) => {
  const summary = req.body;

  // Validation
  if (
    !summary ||
    typeof summary.duelId !== 'string' ||
    typeof summary.winner !== 'string' ||
    typeof summary.players !== 'object' ||
    !['player1', 'player2'].includes(summary.winner)
  ) {
    return res.status(400).json({ error: 'Missing or invalid summary data.' });
  }

  const summaryFile = `summaries/${summary.duelId}.json`;

  try {
    console.log(`[SUMMARY] Checking existing summary → ${summaryFile}`);
    try {
      // Try to load existing summary first
      await load_file(summaryFile);
      return res.status(409).json({ error: 'Summary already exists.' });
    } catch {
      // Not found → proceed to save
    }

    await save_file(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`[SUMMARY] Saved summary for duel ${summary.duelId}`);
    return res.status(200).json({ message: '✅ Summary saved.' });
  } catch (err) {
    console.error('❌ [SUMMARY] Error saving summary:', err);
    return res.status(500).json({ error: 'Failed to save summary.' });
  }
});

export default router;
