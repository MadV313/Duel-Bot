// utils/userUtils.js
//
// Persistent user profile helpers backed by storageClient.
// Keeps prior function names but makes them async-safe.
// - getUserData(userId)    -> Promise<object|null>
// - updateUserData(userId, update) -> Promise<void>
//
// Compatibility: supports either an array of users [{id,...}] or an object map { [id]: {...} } on disk.
// Will always WRITE BACK as an array to preserve legacy expectations.

import { loadJSON, saveJSON } from './storageClient.js';
import { L } from './logs.js';

const USERS_FILE = 'users.json';

/** Normalize arbitrary loaded shape into an array of { id, ... } objects. */
function toArrayShape(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(u => u && typeof u.id !== 'undefined');
  if (typeof data === 'object') {
    return Object.entries(data).map(([id, obj]) => ({ id, ...(obj || {}) }));
  }
  return [];
}

/** Quick index from an array shape. */
function toMap(arr) {
  const m = {};
  for (const u of arr) {
    if (!u || typeof u.id === 'undefined') continue;
    const id = String(u.id);
    m[id] = u;
  }
  return m;
}

/** Load users.json from persistent storage (always returns array shape). */
async function loadUsersArray() {
  try {
    const raw = await loadJSON(USERS_FILE); // {} or [] or undefined
    const arr = toArrayShape(raw);
    L.storage(`[userUtils] Loaded ${arr.length} users from ${USERS_FILE}`);
    return arr;
  } catch (e) {
    L.err(`[userUtils] Failed to load ${USERS_FILE}: ${e.message}`);
    return [];
  }
}

/** Save users back as an array shape to preserve legacy expectations. */
async function saveUsersArray(arr) {
  try {
    await saveJSON(USERS_FILE, Array.isArray(arr) ? arr : []);
    L.storage(`[userUtils] Saved ${Array.isArray(arr) ? arr.length : 0} users to ${USERS_FILE}`);
  } catch (e) {
    L.err(`[userUtils] Failed to save ${USERS_FILE}: ${e.message}`);
    throw e;
  }
}

/**
 * Fetch user data for a given user ID.
 * @param {string} userId - Discord user ID
 * @returns {Promise<object|null>} User object or null
 */
export async function getUserData(userId) {
  const id = String(userId || '');
  if (!id) return null;

  const users = await loadUsersArray();
  const found = users.find(u => String(u.id) === id) || null;
  return found;
}

/**
 * Update user data for a given user ID.
 * Merges fields if user exists, otherwise adds a new user entry.
 * @param {string} userId - Discord user ID
 * @param {object} update - Object containing fields to update
 * @returns {Promise<void>}
 */
export async function updateUserData(userId, update) {
  const id = String(userId || '');
  if (!id) {
    L.err('[userUtils] updateUserData called without userId');
    return;
  }
  if (!update || typeof update !== 'object') {
    L.err('[userUtils] updateUserData called with invalid update payload');
    return;
  }

  const users = await loadUsersArray();
  const idx = users.findIndex(u => String(u.id) === id);

  if (idx !== -1) {
    users[idx] = { ...users[idx], ...update, id }; // preserve id
  } else {
    users.push({ id, ...update });
  }

  await saveUsersArray(users);
}
