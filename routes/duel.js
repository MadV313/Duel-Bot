// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startPracticeDuel, duelState } from '../logic/duelState.js';
import { applyBotMove } from '../logic/botHandler.js';

const router = express.Router();       // mounted at /duel
export const botAlias = express.Router(); // mounted at /bot

// Util to load the core card list from /logic
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_PATH = path.resolve(__dirname, '../logic/CoreMasterReference.json');

async function startPracticeHandler(_req, res) {
  try {
    const raw = await fs.readFile(CORE_PATH, 'utf-8');
    const cards = JSON.parse(raw);
    startPracticeDuel(cards);  // sets duelState (200 HP, draw 3, coin flip)
    res.json(duelState);
  } catch (err) {
    console.error('Practice init failed:', err);
    res.status(500).json({ error: 'Failed to start practice duel', details: String(err.message || err) });
  }
}

// Public endpoints
router.get('/practice', startPracticeHandler); // GET /duel/practice
router.post('/turn', async (req, res) => {
  try {
    const updated = await applyBotMove(req.body);
    res.json(updated);
  } catch (err) {
    console.error('Bot turn failed:', err);
    res.status(500).json({ error: 'Bot move failed', details: String(err.message || err) });
  }
});

// Clean, explicit alias so the UI/bot can call /bot/practice
botAlias.get('/practice', startPracticeHandler);

export default router;
