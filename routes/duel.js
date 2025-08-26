// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startPracticeDuel, duelState } from '../logic/duelState.js';
import { applyBotMove } from '../logic/botHandler.js';

const router = express.Router();          // mounted at /duel
export const botAlias = express.Router(); // mounted at /bot

// ────────────────────────────────────────────────────────────
// Resolve CoreMasterReference.json (cache it after first read)
// ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CORE_PATH  = path.resolve(__dirname, '../logic/CoreMasterReference.json');

let cardsCache = null;
async function loadCoreCards() {
  if (cardsCache) return cardsCache;
  const raw = await fs.readFile(CORE_PATH, 'utf-8');
  cardsCache = JSON.parse(raw);
  console.log(
    `📦 Loaded ${Array.isArray(cardsCache) ? cardsCache.length : 0} cards from CoreMasterReference.`
  );
  return cardsCache;
}

// ────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────
async function startPracticeHandler(req, res) {
  const traceId =
    req.headers['x-trace-id'] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const cards = await loadCoreCards();
    startPracticeDuel(cards); // sets duelState (200 HP, draw 3, coin flip)

    console.log(
      `[duel] practice.init ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
        ip: req.ip,
        mode: duelState.duelMode,
        currentPlayer: duelState.currentPlayer,
      })}`
    );

    res.json(duelState);
  } catch (err) {
    console.error(
      `[duel] practice.error ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
        error: String(err?.message || err),
      })}`
    );
    res.status(500).json({
      error: 'Failed to start practice duel',
      details: String(err?.message || err),
      traceId,
    });
  }
}

async function botTurnHandler(req, res) {
  const traceId =
    req.headers['x-trace-id'] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    console.log(
      `[duel] bot.turn.request ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
      })}`
    );

    const updated = await applyBotMove(req.body);

    console.log(
      `[duel] bot.turn.ok ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
        currentPlayer: updated?.currentPlayer,
      })}`
    );

    res.json(updated);
  } catch (err) {
    console.error(
      `[duel] bot.turn.error ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
        error: String(err?.message || err),
      })}`
    );
    res.status(500).json({
      error: 'Bot move failed',
      details: String(err?.message || err),
      traceId,
    });
  }
}

function statusHandler(_req, res) {
  res.json({
    ok: true,
    mode: duelState.duelMode || 'none',
    currentPlayer: duelState.currentPlayer || null,
    startedAt: duelState.startedAt || null,
  });
}

// ────────────────────────────────────────────────────────────
/** Public routes
 *  (Mount in server.js as:)
 *    app.use('/duel', router);
 *    app.use('/bot', botAlias);
 */
// ────────────────────────────────────────────────────────────

// Health / status
router.get('/status', statusHandler);
botAlias.get('/status', statusHandler);

// Start practice (GET /duel/practice and alias GET /bot/practice)
router.get('/practice', startPracticeHandler);
botAlias.get('/practice', startPracticeHandler);

// Bot turn (UI posts state to /duel/turn)
router.post('/turn', botTurnHandler);

// Optional: debugging peek at current state
router.get('/state', (_req, res) => res.json(duelState));

export default router;
