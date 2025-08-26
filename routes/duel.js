// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { applyBotMove } from '../logic/botHandler.js';
import { startPracticeDuel, duelState } from '../logic/duelState.js';

const router = express.Router();

/**
 * POST /duel/turn
 * Bot takes a turn using current duelState (Practice Mode)
 */
router.post('/turn', async (req, res) => {
  const clientState = req.body;

  try {
    const updatedState = await applyBotMove(clientState);
    res.json(updatedState);
  } catch (err) {
    console.error('Bot move failed:', err);
    res.status(500).json({ error: 'Bot move failed', details: err.message });
  }
});

/**
 * GET /duel/practice
 * Start a new practice duel (admin-triggered or UI trigger)
 * Loads CoreMasterReference from /logic (correct location)
 */
async function startPracticeHandler(_req, res) {
  try {
    const cardFile = path.resolve('./logic/CoreMasterReference.json'); // ✅ fixed
    const rawData = await fs.readFile(cardFile, 'utf-8');
    const cardList = JSON.parse(rawData);

    startPracticeDuel(cardList);
    res.json(duelState);
  } catch (err) {
    console.error('Practice duel initialization failed:', err);
    res.status(500).json({ error: 'Failed to start practice duel', details: err.message });
  }
}

router.get('/practice', startPracticeHandler);

// 🔁 Alias to match existing frontend calls to /bot/practice
router.get('/../bot/practice', startPracticeHandler); // won’t be used; keep explicit below
router.get('/practice-alias', startPracticeHandler);
router.get('/alias', startPracticeHandler);

// Proper path alias (no relative weirdness):
const aliasRouter = express.Router();
aliasRouter.get('/practice', startPracticeHandler);
export const botAlias = aliasRouter;

export default router;
