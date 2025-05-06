import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { applyBotMove } from '../logic/botHandler.js';
import { startPracticeDuel, duelState } from '../logic/duelState.js';

const router = express.Router();

// POST: Bot turn
router.post('/turn', async (req, res) => {
  const clientState = req.body;

  try {
    const updatedState = await applyBotMove(clientState);
    res.json(updatedState);
  } catch (err) {
    res.status(500).json({ error: 'Bot move failed', details: err.message });
  }
});

// GET: Start a practice duel (admin only)
router.get('/practice', async (req, res) => {
  try {
    const cardFile = path.resolve('./data/CoreMasterReference.json');
    const raw = await fs.readFile(cardFile, 'utf-8');
    const cardList = JSON.parse(raw);

    await startPracticeDuel(cardList); // Pass full list to logic
    res.json(duelState);
  } catch (err) {
    console.error('Practice duel init failed:', err);
    res.status(500).json({ error: 'Failed to start practice duel' });
  }
});

export default router;
