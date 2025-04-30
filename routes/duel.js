import express from 'express';
import { applyBotMove } from '../logic/botHandler.js';
import { startPracticeDuel, duelState } from '../logic/duelState.js';

const router = express.Router();

// Existing route — apply bot move
router.post('/turn', async (req, res) => {
  const clientState = req.body;

  try {
    const updatedState = await applyBotMove(clientState);
    res.json(updatedState);
  } catch (err) {
    res.status(500).json({ error: 'Bot move failed', details: err.message });
  }
});

// NEW: Route to start a practice duel
router.get('/practice', async (req, res) => {
  try {
    await startPracticeDuel(); // Resets duelState and builds random decks
    res.json(duelState);       // Return the full new duel state
  } catch (err) {
    console.error('Practice duel init failed:', err);
    res.status(500).json({ error: 'Failed to start practice duel' });
  }
});

export default router;
