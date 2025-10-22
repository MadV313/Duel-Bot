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
// Helpers
// ────────────────────────────────────────────────────────────
function clone(v) {
  try { return JSON.parse(JSON.stringify(v)); }
  catch { return v; }
}

/**
 * Build a spectator-safe snapshot of the current state.
 * - normalizes players.player2 ← bot if needed
 * - optional hand redaction (`safeView=true`): send facedown placeholders
 */
function buildSpectatorState(srcState, { safeView = false, sessionId = null } = {}) {
  if (!srcState || !srcState.players) {
    return null;
  }

  // Some code paths still store the opponent under "bot". Normalize to player2 for the UI.
  const p1Raw = srcState.players.player1;
  const p2Raw = srcState.players.player2 ?? srcState.players.bot;

  if (!p1Raw || !p2Raw) return null;

  const p1 = clone(p1Raw);
  const p2 = clone(p2Raw);

  if (safeView) {
    const redact = (hand = []) =>
      Array.from({ length: Array.isArray(hand) ? hand.length : 0 }, () => ({ cardId: '000', isFaceDown: true }));
    p1.hand = redact(p1.hand);
    p2.hand = redact(p2.hand);
  }

  // Count spectators from array if present; otherwise 0
  const spectatorCount = Array.isArray(srcState.spectators) ? srcState.spectators.length : 0;

  return {
    players: {
      player1: p1,
      player2: p2,
    },
    currentPlayer: srcState.currentPlayer ?? null,
    winner: srcState.winner ?? null,
    spectatorCount,
    wager: srcState.wagerAmount || 0,
    mode: srcState.duelMode || 'none',
    startedAt: srcState.startedAt || null,
    session: sessionId || null,
  };
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
    startPracticeDuel(cards); // sets global duelState (200 HP, draw 3, coin flip)

    // NEW: also reflect the practice duel into the session registry
    const sessionId = 'practice';
    upsertSession({
      id: sessionId,
      status: 'live',
      isPractice: true,
      // You can fill names if your duelState tracks them; safe defaults here:
      players: [
        // viewer name resolution is handled client-side; ids can be empty here
        { userId: '', name: 'Player' },
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

    // ✅ Use the live in-memory duelState
    const updated = await applyBotMove(duelState);

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

// NEW: live/current endpoint for spectator UIs (and /bot alias)
function liveCurrentHandler(req, res) {
  const safeView = String(req.query.safeView || '').toLowerCase() === 'true';
  const sessionId = (req.query.session ?? '').toString().trim();

  let state = null;
  if (sessionId) {
    try {
      state = getSessionState?.(sessionId) || null;
    } catch {
      state = null;
    }
  }
  if (!state) state = duelState;

  const snapshot = buildSpectatorState(state, { safeView, sessionId });
  if (!snapshot) {
    return res.status(404).json({ error: 'No duel in progress.' });
  }
  return res.json(snapshot);
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

// NEW (non-breaking additions)
router.get('/active', listActiveHandler);          // /duel/active
router.get('/state', stateHandler);                // /duel/state[?session=...]

// ✅ NEW spectator-friendly state (used by the Spectator View UI)
router.get('/live/current', liveCurrentHandler);
botAlias.get('/live/current', liveCurrentHandler); // /bot/live/current

export default router;
