// routes/duelLive.js
import express from 'express';
import { duelState } from '../logic/duelState.js';
// Optional multi-duel: will be a no-op if you haven't wired a registry yet
import { getSessionState } from '../logic/duelRegistry.js';
import { createHash } from 'crypto';

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
 *   allowEmpty=true-> (non-breaking) if no duel, returns an empty stub with 200 instead of 404
 */
router.get('/current', (req, res) => {
  // Do not cache by proxies/CDNs; clients use ETag below for 304s
  res.set('Cache-Control', 'no-store');
  // Helps conditional requests behave consistently
  res.set('Vary', 'If-None-Match');

  const safeView   = String(req.query.safeView || '').toLowerCase() === 'true';
  const sessionId  = (req.query.session ?? '').toString().trim();
  const allowEmpty = String(req.query.allowEmpty || '').toLowerCase() === 'true';

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
    spectatorCount: spectatorCountRaw = undefined, // some registries store a number
    wagerAmount = 0,
    duelMode = 'none',
    startedAt = null,
  } = state || {};

  // Normalize players (schema sometimes uses "bot" instead of "player2")
  const p1Raw = players.player1;
  const p2Raw = players.player2 ? players.player2 : players.bot;

  // When there's no duel, optionally return a harmless stub for long-polling UIs
  if (!p1Raw || !p2Raw) {
    if (allowEmpty) {
      const emptyPayload = {
        players: { player1: null, player2: null },
        currentPlayer: null,
        winner: null,
        spectatorCount: 0,
        wager: 0,
        mode: 'none',
        startedAt: null,
        session: sessionId || null,
        ok: false
      };

      // ETag for the empty payload so clients can avoid re-downloading
      const etag = etagFor(emptyPayload);
      if (etag && req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      if (etag) res.set('ETag', etag);
      return res.status(200).json(emptyPayload);
    }
    return res.status(404).json({ error: 'No duel in progress.' });
  }

  // Helper to normalize a player snapshot and ensure counts are present
  const normalizePlayer = (src) => {
    const handArr    = Array.isArray(src.hand) ? src.hand : [];
    const fieldArr   = Array.isArray(src.field) ? src.field : (Array.isArray(src.board) ? src.board : []);
    const deckArr    = Array.isArray(src.deck) ? src.deck : [];
    const discardArr = Array.isArray(src.discardPile) ? src.discardPile : [];

    const base = {
      ...src,
      hp: Number(src.hp ?? src.HP ?? src.health ?? 200) || 0,
      field: fieldArr.slice(0),
      // Always surface numerics, even if arrays aren't present on the raw state
      handCount: Number(src.handCount ?? handArr.length) || 0,
      deckCount: Number(src.deckCount ?? deckArr.length) || 0,
      discardCount: Number(src.discardCount ?? discardArr.length) || 0
    };

    // Respect safeView by stripping hand array but keeping the count for the UI
    if (safeView) {
      base.hand = []; // no actual cards sent
    } else {
      base.hand = handArr.slice(0);
    }
    return base;
  };

  // Shallow-safe copies so we never mutate live state
  const player1 = normalizePlayer(p1Raw);
  const player2 = normalizePlayer(p2Raw);

  // Prefer an explicit numeric spectatorCount, fallback to array length, else 0
  const spectatorCount =
    (Number.isFinite(spectatorCountRaw) ? Number(spectatorCountRaw) : undefined) ??
    (Array.isArray(spectators) ? spectators.length : 0);

  // Build the exact payload we’ll send (used for ETag as well)
  const payload = {
    players: { player1, player2 },
    currentPlayer,
    winner,
    spectatorCount,
    wager: Number(wagerAmount) || 0,
    // Helpful metadata (non-breaking)
    mode: duelMode,
    startedAt,
    session: sessionId || null,
  };

  // Conditional GET: weak ETag to allow client 304s and ease server load
  const etag = etagFor(payload);
  if (etag && req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  if (etag) res.set('ETag', etag);

  return res.status(200).json(payload);
});

/** Create a weak ETag for a small JSON payload (helps avoid 429s via 304s). */
function etagFor(obj) {
  try {
    const json = JSON.stringify(obj);
    const hash = createHash('sha1').update(json).digest('base64').slice(0, 16);
    // W/ marks a weak ETag which is fine for JSON snapshots
    return `W/"${hash}-${json.length}"`;
  } catch {
    return undefined;
  }
}

export default router;
