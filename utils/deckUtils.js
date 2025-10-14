// utils/deckUtils.js
// Utilities that operate on ID-keyed linked_decks.json and related data files.
// Provides token → userId resolution, master list loading,
// and both map- and array-shaped collection helpers (compat).

import fs from 'fs/promises';
import path from 'path';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const playerDataPath  = path.resolve('./data/player_data.json');
const coinBankPath    = path.resolve('./data/coin_bank.json');
const masterPath      = path.resolve('./logic/CoreMasterReference.json');

export function pad3(n) {
  return String(n).padStart(3, '0');
}

async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Loads the full map of linked decks keyed by userId.
 * {
 *   "1234567890": {
 *     discordName: "Miles",
 *     deck: [],
 *     collection: { "001": 2, "002": 1, ... },
 *     token: "abc...",
 *     createdAt: "...",
 *     lastLinkedAt: "..."
 *   }
 * }
 */
export async function loadLinkedDecks() {
  const data = await readJson(linkedDecksPath, {});
  // Ensure an object map
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

/**
 * Returns userId for a given token or null if not found.
 */
export async function resolveUserIdByToken(token) {
  if (!token) return null;
  const linked = await loadLinkedDecks();
  for (const [userId, profile] of Object.entries(linked)) {
    if (profile && profile.token === token) return userId;
  }
  return null;
}

/**
 * Returns the full player profile by userId, or null if missing.
 */
export async function getPlayerProfileByUserId(userId) {
  const linked = await loadLinkedDecks();
  return linked[userId] || null;
}

/**
 * Returns a simple { "001": 2, "002": 0, ... } map for the player's collection.
 * Guarantees 3-digit keys, excludes invalid entries, keeps raw counts as-is.
 */
export async function getPlayerCollectionMap(userId) {
  const profile = await getPlayerProfileByUserId(userId);
  const map = {};
  if (!profile || !profile.collection || typeof profile.collection !== 'object') {
    return map;
  }
  for (const [k, v] of Object.entries(profile.collection)) {
    const id = pad3(k);
    const count = Number(v) || 0;
    if (!Number.isFinite(count) || id === 'NaN') continue;
    map[id] = count;
  }
  return map;
}

/**
 * ⚠️ COMPAT: Older routes import { getPlayerCollection } expecting an ARRAY like:
 *   [{ number: "001", owned: 2 }, ...] sorted ascending, excluding "000".
 * This wrapper converts the map shape to the legacy array shape.
 */
export async function getPlayerCollection(userId) {
  const map = await getPlayerCollectionMap(userId);
  return Object.entries(map)
    .filter(([id]) => id !== '000')
    .map(([number, owned]) => ({ number, owned: Number(owned) || 0 }))
    .sort((a, b) => parseInt(a.number) - parseInt(b.number));
}

/**
 * Loads master card list from logic/CoreMasterReference.json and normalizes entries.
 * Ensures array of objects with fields: { card_id, name, rarity, type, image }
 * Skips #000 in callers.
 */
export async function loadMaster() {
  const raw = await readJson(masterPath, []);
  const arr = Array.isArray(raw) ? raw : (raw.cards || []);
  // Normalize: card_id must be 3-digit string
  return arr.map(c => ({
    card_id: pad3(c.card_id ?? c.number ?? c.id ?? ''),
    name: c.name ?? `Card ${c.card_id}`,
    rarity: c.rarity ?? 'Common',
    type: c.type ?? 'Unknown',
    image: c.image ?? `${pad3(c.card_id)}_${(c.name || 'Card').replace(/[^a-zA-Z0-9._-]/g, '')}_${(c.type || 'Unknown').replace(/[^a-zA-Z0-9._-]/g, '')}.png`
  }));
}

/**
 * Returns { wins, losses, coins } for the user.
 */
export async function getUserStats(userId) {
  const [playerData, bank] = await Promise.all([
    readJson(playerDataPath, {}),
    readJson(coinBankPath, {})
  ]);

  const wins = Number(playerData?.[userId]?.wins ?? 0) || 0;
  const losses = Number(playerData?.[userId]?.losses ?? 0) || 0;
  const coins = Number(bank?.[userId] ?? 0) || 0;

  return { wins, losses, coins };
}
