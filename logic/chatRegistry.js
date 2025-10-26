// logic/chatRegistry.js
// In-memory, per-room chat registry with lightweight presence + history.
// ✅ Keeps all existing exports/behavior and adds a few helpers for spectator counts.

const ROOMS = new Map(); // roomId -> { users: Map(userId -> name), messages: [], typing: Set(), spectatorCount: number }
const MAX_HISTORY = 100;

/** Internal helper: ensure room structure exists. */
function _initRoom(roomId) {
  if (!ROOMS.has(roomId)) {
    ROOMS.set(roomId, { users: new Map(), messages: [], typing: new Set(), spectatorCount: 0 });
  }
  return ROOMS.get(roomId);
}

/** Public: get (and create if needed) a room object. */
export function getRoom(roomId) {
  return _initRoom(roomId);
}

/** Public: join a room; updates presence. */
export function joinRoom(roomId, userId, name) {
  const room = _initRoom(roomId);
  const display = name || `Spectator-${String(userId).slice(0, 4)}`;
  room.users.set(String(userId), display);
  room.spectatorCount = room.users.size; // mirror for cheap reads
  return room;
}

/** Public: leave a room; updates presence and typing. */
export function leaveRoom(roomId, userId) {
  const room = _initRoom(roomId);
  room.users.delete(String(userId));
  room.typing.delete(String(userId));
  room.spectatorCount = room.users.size;
  return room;
}

/** Public: set/unset typing state; returns array of userIds currently typing. */
export function setTyping(roomId, userId, isTyping) {
  const room = _initRoom(roomId);
  if (isTyping) room.typing.add(String(userId));
  else room.typing.delete(String(userId));
  return Array.from(room.typing);
}

/** Public: append a message to room history (capped). */
export function appendMessage(roomId, msg) {
  const room = _initRoom(roomId);
  room.messages.push(msg);
  if (room.messages.length > MAX_HISTORY) {
    room.messages.splice(0, room.messages.length - MAX_HISTORY);
  }
  return msg;
}

/** Public: get room history array (most recent last). */
export function getHistory(roomId) {
  return _initRoom(roomId).messages;
}

/** Public: presence details (count + display names). */
export function getPresence(roomId) {
  const room = _initRoom(roomId);
  return {
    count: room.spectatorCount, // mirrors users.size
    users: Array.from(room.users.values())
  };
}

/* ──────────────────────────────────────────────────────────
 * 🆕 Helpers (non-breaking) — used by routes to report spectator counts
 * ────────────────────────────────────────────────────────── */

/** Get only the spectator count for a room (fast path). */
export function getSpectatorCount(roomId) {
  return _initRoom(roomId).spectatorCount;
}

/** Snapshot of all rooms' spectator counts. */
export function getAllSpectatorCounts() {
  const out = {};
  for (const [roomId, room] of ROOMS.entries()) {
    out[roomId] = room.spectatorCount || 0;
  }
  return out;
}

/** Optional: prune empty rooms (never called automatically; export for maintenance). */
export function pruneEmptyRooms() {
  for (const [roomId, room] of ROOMS.entries()) {
    if ((room.users?.size || 0) === 0 && (room.messages?.length || 0) === 0) {
      ROOMS.delete(roomId);
    }
  }
}
