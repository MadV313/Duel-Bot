import express from 'express';
import { duelState } from '../logic/duelState.js';
// Optional multi-duel: will be a no-op if you haven't wired a registry yet
import { getSessionState } from '../logic/duelRegistry.js';

const router = express.Router();

/**
 * GET /current
 * Returns the current duel state including:
 * - players (optionally redacted hands)
 * - currentPlayer
 * - winner
 * - spectatorCount
 * - wager
 *
 * Query params:
 *   safeView=true  -> redact both players' hands (face-down placeholders)
 *   session=<id>   -> return state for a specific session (falls back to global if missing)
 */
router.get('/current', (req, res) => {
  const safeView = String(req.query.safeView || '').toLowerCase() === 'true';
  const sessionId = (req.query.session ?? '').toString().trim();

  // Resolve state: prefer per-session if provided and available; else global duelState
  let state = null;
  if (sessionId) {
    try {
      state = getSessionState?.(sessionId) || null;
    } catch {
      state = null;
    }
  }
  if (!state) state = duelState;

  const {
    players = {},
    currentPlayer = null,
    winner = null,
    spectators = [],
    wagerAmount = 0,
    duelMode = 'none',
    startedAt = null,
    lastBotAction = null,
    lastBotActionAt = null,
  } = state || {};

  // Normalize players (schema sometimes uses "bot" instead of "player2")
  const p1Raw = players.player1;
  const p2Raw = players.player2 ? players.player2 : players.bot;

  if (!p1Raw || !p2Raw) {
    return res.status(404).json({ error: 'No duel in progress.' });
  }

  // Shallow copies so we never mutate live state (copy hand & field arrays)
  const player1 = {
    ...p1Raw,
    hand: Array.isArray(p1Raw.hand) ? [...p1Raw.hand] : [],
    field: Array.isArray(p1Raw.field) ? [...p1Raw.field] : [],
  };
  const player2 = {
    ...p2Raw,
    hand: Array.isArray(p2Raw.hand) ? [...p2Raw.hand] : [],
    field: Array.isArray(p2Raw.field) ? [...p2Raw.field] : [],
  };

  // Handle safe view mode (hide hand card IDs)
  if (safeView) {
    const redact = (hand = []) => hand.map(() => ({ cardId: '000', isFaceDown: true }));
    player1.hand = redact(player1.hand);
    player2.hand = redact(player2.hand);
  }

  return res.status(200).json({
    players: { player1, player2 },
    currentPlayer,
    winner,
    spectatorCount: Array.isArray(spectators) ? spectators.length : 0,
    wager: wagerAmount || 0,
    // Helpful metadata (non-breaking)
    mode: duelMode,
    startedAt,
    session: sessionId || null,
    lastBotAction,
    lastBotActionAt,
    ts: Date.now(),
  });
});

export default router;
