// logic/chatRegistry.js
const ROOMS = new Map(); // roomId -> { users: Map(userId -> name), messages: [], typing: Set() }
const MAX_HISTORY = 100;

export function getRoom(roomId) {
  if (!ROOMS.has(roomId)) {
    ROOMS.set(roomId, { users: new Map(), messages: [], typing: new Set() });
  }
  return ROOMS.get(roomId);
}

export function joinRoom(roomId, userId, name) {
  const room = getRoom(roomId);
  room.users.set(userId, name || `Spectator-${userId.slice(0,4)}`);
  return room;
}

export function leaveRoom(roomId, userId) {
  const room = getRoom(roomId);
  room.users.delete(userId);
  room.typing.delete(userId);
  return room;
}

export function setTyping(roomId, userId, isTyping) {
  const room = getRoom(roomId);
  if (isTyping) room.typing.add(userId);
  else room.typing.delete(userId);
  return Array.from(room.typing);
}

export function appendMessage(roomId, msg) {
  const room = getRoom(roomId);
  room.messages.push(msg);
  if (room.messages.length > MAX_HISTORY) room.messages.splice(0, room.messages.length - MAX_HISTORY);
  return msg;
}

export function getHistory(roomId) {
  return getRoom(roomId).messages;
}

export function getPresence(roomId) {
  return { count: getRoom(roomId).users.size, users: Array.from(getRoom(roomId).users.values()) };
}
