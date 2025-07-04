import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { applyBotMove } from '../logic/botHandler.js';
import { startPracticeDuel, duelState } from '../logic/duelState.js';

const router = express.Router();

// POST: Bot takes a turn using current duelState (Practice Mode)
router.post('/turn', async (req, res) => {
  const clientState = req.body;

  try {
    const updatedState = await applyBotMove(clientState);
    res.json(updatedState);
  } catch (err) {
    console.error('Bot turn error:', err);
    res.status(500).json({ error: 'Bot move failed', details: err.message });
  }
});

// GET: Start a new practice duel (Admin-triggered only)
router.get('/practice', async (req, res) => {
  try {
    const cardFile = path.resolve('./data/CoreMasterReference.json');
    const rawData = await fs.readFile(cardFile, 'utf-8');
    const cardList = JSON.parse(rawData);

    startPracticeDuel(cardList); // Reinitializes duelState for practice mode
    res.json(duelState);
  } catch (err) {
    console.error('Practice duel initialization failed:', err);
    res.status(500).json({ error: 'Failed to start practice duel' });
  }
});

export default router;
