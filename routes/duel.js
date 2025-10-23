// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startPracticeDuel, duelState } from '../logic/duelState.js';
import { applyBotMove } from '../logic/botHandler.js';

// NEW: session registry
import {
  upsertSession,
  setSessionStateProvider,
  listActiveSessions,
  getSessionState,
} from '../logic/duelRegistry.js';

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
/* Handlers */
// ────────────────────────────────────────────────────────────
async function startPracticeHandler(req, res) {
  const traceId =
    req.headers['x-trace-id'] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const cards = await loadCoreCards();
    startPracticeDuel(cards); // sets global duelState (200 HP, draw 3, coin flip)

    // reflect the practice duel into the session registry
    const sessionId = 'practice';
    upsertSession({
      id: sessionId,
      status: 'live',
      isPractice: true,
      players: [
        { userId: '',   name: 'Player' },
        { userId: 'bot', name: 'Practice Bot' },
      ],
    });
    setSessionStateProvider(sessionId, () => duelState);

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

    // ✅ mutate the real global state, not req.body
    const updated = await applyBotMove(duelState);

    // (optional) refresh "practice" session updatedAt later if needed

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
// NEW: /duel/sync — mirror client snapshot for spectator
// (guarded merge: only fields spectators need to see)
// ────────────────────────────────────────────────────────────
function syncHandler(req, res) {
  try {
    const s = req.body?.players;
    if (!s?.player1 || !s?.bot) {
      return res.status(400).json({ error: 'bad payload' });
    }

    // HP
    duelState.players.player1.hp = Number(s.player1.hp ?? duelState.players.player1.hp);
    duelState.players.bot.hp     = Number(s.bot.hp ?? duelState.players.bot.hp);

    // Field
    if (Array.isArray(s.player1.field)) duelState.players.player1.field = s.player1.field;
    if (Array.isArray(s.bot.field))     duelState.players.bot.field     = s.bot.field;

    // Discard piles
    if (Array.isArray(s.player1.discardPile)) duelState.players.player1.discardPile = s.player1.discardPile;
    if (Array.isArray(s.bot.discardPile))     duelState.players.bot.discardPile     = s.bot.discardPile;

    // (optional) hands / decks for accurate counts
    if (Array.isArray(s.player1.hand)) duelState.players.player1.hand = s.player1.hand;
    if (Array.isArray(s.bot.hand))     duelState.players.bot.hand     = s.bot.hand;
    if (Array.isArray(s.player1.deck)) duelState.players.player1.deck = s.player1.deck;
    if (Array.isArray(s.bot.deck))     duelState.players.bot.deck     = s.bot.deck;

    // Turn indicator (optional)
    if (typeof req.body.currentPlayer === 'string') {
      duelState.currentPlayer = req.body.currentPlayer;
    }

    // (optional) startedAt remains as-in unless you want to update

    return res.json({ ok: true, state: duelState });
  } catch (e) {
    return res.status(500).json({ error: 'sync failed', details: String(e) });
  }
}

// ────────────────────────────────────────────────────────────
// NEW: multi-lobby endpoints (non-breaking)
// ────────────────────────────────────────────────────────────

// List all currently active sessions (practice + any future PvP)
function listActiveHandler(_req, res) {
  const list = listActiveSessions();
  res.json({ duels: list });
}

// Return duel state; supports ?session=... (falls back to global practice for backward-compat)
function stateHandler(req, res) {
  const sessionId = String(req.query.session || '').trim();
  if (sessionId) {
    const state = getSessionState(sessionId);
    if (state) return res.json(state);
    return res.status(404).json({ error: 'Session not found', session: sessionId });
  }
  // Backward-compat: no session param returns the global duelState
  return res.json(duelState);
}

// ────────────────────────────────────────────────────────────
router.get('/status', statusHandler);
botAlias.get('/status', statusHandler);

router.get('/practice', startPracticeHandler);     // /duel/practice
botAlias.get('/practice', startPracticeHandler);   // /bot/practice

router.post('/turn', botTurnHandler);              // /duel/turn

// NEW
router.post('/sync', syncHandler);                 // /duel/sync

// NEW (non-breaking additions)
router.get('/active', listActiveHandler);          // /duel/active
router.get('/state', stateHandler);                // /duel/state[?session=...]

export default router;
