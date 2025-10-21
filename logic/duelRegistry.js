// logic/duelRegistry.js
// Minimal in-memory registry for multiple concurrent duels (PvP + practice)

const _sessions = new Map(); // sessionId -> { id, status, isPractice, players, createdAt, updatedAt, stateProvider? }

/** Create or update a session entry. */
export function upsertSession({ id, status = 'live', isPractice = false, players = [] }) {
  const now = Date.now();
  const prev = _sessions.get(id) || {};
  const entry = {
    id,
    status,
    isPractice,
    players,
    createdAt: prev.createdAt || now,
    updatedAt: now,
    stateProvider: prev.stateProvider || null,
  };
  _sessions.set(id, entry);
  return entry;
}

/** Attach a function that returns the current duelState for this session. */
export function setSessionStateProvider(id, providerFn /* () => duelState or null */) {
  const s = _sessions.get(id);
  if (!s) return null;
  s.stateProvider = typeof providerFn === 'function' ? providerFn : null;
  s.updatedAt = Date.now();
  _sessions.set(id, s);
  return s;
}

/** Get current session metadata (not the full state). */
export function getSession(id) {
  return _sessions.get(id) || null;
}

/** Return a shallow list of active sessions for the /duel/active endpoint. */
export function listActiveSessions() {
  // You can add pruning/ttl here later if needed
  return Array.from(_sessions.values())
    .filter(s => ['live', 'active', 'running', 'in_progress', 'started'].includes(String(s.status).toLowerCase()))
    .map(s => ({
      id: s.id,
      status: s.status,
      isPractice: !!s.isPractice,
      players: Array.isArray(s.players) ? s.players : [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
}

/** Read the live duel state via the session's stateProvider (if set). */
export function getSessionState(id) {
  const s = _sessions.get(id);
  if (!s || !s.stateProvider) return null;
  try {
    return s.stateProvider();
  } catch {
    return null;
  }
}

/** Remove a session (e.g., when a duel ends). */
export function removeSession(id) {
  _sessions.delete(id);
}

/** Utility for future PvP creation (optional helper). */
export function ensureSession(id, init = {}) {
  if (_sessions.has(id)) return _sessions.get(id);
  return upsertSession({ id, ...init });
}
