// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { startPracticeDuel, duelState } from '../logic/duelState.js';
// ✅ Backward-compatible imports: supports old and new bot handler names
import applyBotMoveCompat, {
  applyBotMove as namedApply,
  botTurn as legacyBotTurn,
} from '../logic/botHandler.js';

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
 * - normalizes players.player2 ← bot (read-only) when needed
 * - optional hand redaction (`safeView=true`): send facedown placeholders
 */
function buildSpectatorState(srcState, { safeView = false, sessionId = null } = {}) {
  if (!srcState || !srcState.players) return null;

  // Read-only normalization (do not mutate the live duelState)
  const p1Raw = srcState.players.player1;
  const p2Raw = srcState.players.player2 ?? srcState.players.bot;
  if (!p1Raw || !p2Raw) return null;

  const p1 = clone(p1Raw);
  const p2 = clone(p2Raw);

  if (safeView) {
    const redact = (hand = []) =>
      Array.from(
        { length: Array.isArray(hand) ? hand.length : 0 },
        () => ({ cardId: '000', isFaceDown: true })
      );
    p1.hand = redact(p1.hand);
    p2.hand = redact(p2.hand);
  }

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
/** GET /duel/practice — initialize a practice duel vs the bot */
async function startPracticeHandler(req, res) {
  const traceId =
    req.headers['x-trace-id'] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const cards = await loadCoreCards();
    startPracticeDuel(cards); // sets global duelState (200 HP, draw 3, coin flip)

    // ✅ Clear names for spectator & UI alignment
    if (duelState?.players?.player1) {
      duelState.players.player1.discordName = duelState.players.player1.discordName || 'Challenger';
    }
    if (duelState?.players?.bot) {
      duelState.players.bot.discordName = 'Practice Bot';
    }

    // Reflect the practice duel into the session registry
    const sessionId = 'practice';
    upsertSession({
      id: sessionId,
      status: 'live',
      isPractice: true,
      players: [
        { userId: '',    name: duelState?.players?.player1?.discordName || 'Challenger' },
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

/**
 * POST /duel/turn — minimal, SAFE turn handler (server is source of truth)
 *
 * - Does NOT accept/merge any client-provided zones (hand/field/discard/deck).
 * - Flips to bot when needed and invokes the bot handler using any of the
 *   supported export names (new, legacy, default).
 * - After the bot move, currentPlayer is guaranteed to be 'player1'
 *   because the handler sets it.
 */
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

    // 🚫 We intentionally ignore any client payload that might try to send zones.
    // const { hand, field, discardPile, deck, ...rest } = req.body || {};

    // Pick a compatible bot handler (supports renamed imports)
    const botHandler =
      (typeof namedApply === 'function' && namedApply) ||
      (typeof applyBotMoveCompat === 'function' && applyBotMoveCompat) ||
      (typeof legacyBotTurn === 'function' && legacyBotTurn);

    if (!botHandler) {
      throw new Error('No bot handler available (applyBotMove / botTurn export missing).');
    }

    // If it's currently the player's turn, flip to bot before invoking
    if (duelState.currentPlayer === 'player1') {
      duelState.currentPlayer = 'bot';
    }

    // Execute one bot move; the bot handler will ALWAYS set currentPlayer back to 'player1'
    const updated = await botHandler(duelState);

    console.log(
      `[duel] bot.turn.ok ${JSON.stringify({
        t: new Date().toISOString(),
        traceId,
        currentPlayer: updated?.currentPlayer,
      })}`
    );

    // Return authoritative server state ONLY
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

/** GET /duel/status — small health/status */
function statusHandler(_req, res) {
  res.json({
    ok: true,
    mode: duelState.duelMode || 'none',
    currentPlayer: duelState.currentPlayer || null,
    startedAt: duelState.startedAt || null,
  });
}

/** GET /duel/live/current — spectator-friendly state (and /bot alias) */
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

  // Build a read-only normalized snapshot (player2 ← bot when needed)
  const snapshot = buildSpectatorState(state, { safeView, sessionId });
  if (!snapshot) {
    return res.status(404).json({ error: 'No duel in progress.' });
  }
  return res.json(snapshot);
}

// ────────────────────────────────────────────────────────────
// NEW: multi-lobby endpoints (non-breaking)
// ────────────────────────────────────────────────────────────
function listActiveHandler(_req, res) {
  const list = listActiveSessions();
  res.json({ duels: list });
}

function stateHandler(req, res) {
  const sessionId = String(req.query.session || '').trim();
  if (sessionId) {
    const state = getSessionState(sessionId);
    if (state) return res.json(state);
    return res.status(404).json({ error: 'Session not found', session: sessionId });
  }
  return res.json(duelState);
}

// ────────────────────────────────────────────────────────────
router.get('/status', statusHandler);
botAlias.get('/status', statusHandler);

router.get('/practice', startPracticeHandler);     // /duel/practice
botAlias.get('/practice', startPracticeHandler);   // /bot/practice

router.post('/turn', botTurnHandler);              // /duel/turn

router.get('/active', listActiveHandler);          // /duel/active
router.get('/state', stateHandler);                // /duel/state[?session=...]

router.get('/live/current', liveCurrentHandler);   // ✅ used by Spectator View UI
botAlias.get('/live/current', liveCurrentHandler);

export default router;
