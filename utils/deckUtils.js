// utils/deckUtils.js
// Utilities that operate on ID-keyed linked_decks.json and related data files.
// Provides token → userId resolution, master list loading,
// and both map- and array-shaped collection helpers (compat).
//
// 🔁 Updated for persistent storage via storageClient:
// - All file reads now go through storageClient.load_file(relPath)
// - Paths are taken from utils/config.js -> config.files.*
// - Adds robust JSON parsing + fallbacks with [STORAGE] debug logs
//
// Existing public API (function names/shapes) is UNCHANGED.

import path from 'path';
import { config } from './config.js';
import * as storageClient from './storageClient.js'; // expects async load_file/save_file

// Resolve repo-relative defaults as a last resort (should NOT generally be used)
const legacyDefaults = {
  linked_decks: path.resolve('./data/linked_decks.json'),
  player_data:  path.resolve('./data/player_data.json'),
  coin_bank:    path.resolve('./data/coin_bank.json'),
  master_cards: path.resolve('./logic/CoreMasterReference.json'),
};

const files = {
  linked_decks: config?.files?.linked_decks || 'data/linked_decks.json',
  player_data:  config?.files?.player_data  || 'data/player_data.json',
  coin_bank:    config?.files?.wallet       || 'data/coin_bank.json',
  master_cards: config?.files?.master_cards || 'logic/CoreMasterReference.json',
};

export function pad3(n) {
  return String(n).padStart(3, '0');
}

/** Internal: robust JSON loader via storageClient with fallback & debug logs */
async function readJson(relPath, fallback = {}) {
  const rel = String(relPath || '').replace(/^\/+/, '');
  try {
    const raw = await storageClient.load_file(rel);
    if (raw == null) {
      console.warn(`[STORAGE] ${rel} returned null/undefined; using fallback.`);
      return fallback;
    }
    // raw may be Buffer | string | object depending on client; normalize
    let txt;
    if (typeof raw === 'string') txt = raw;
    else if (Buffer.isBuffer(raw)) txt = raw.toString('utf-8');
    else if (typeof raw === 'object') {
      // Some storage adapters may already hand back parsed JSON
      return raw;
    } else {
      console.warn(`[STORAGE] ${rel} unsupported payload type ${typeof raw}; using fallback.`);
      return fallback;
    }

    try {
      const parsed = JSON.parse(txt);
      console.log(`[STORAGE] Loaded ${rel} successfully.`);
      return parsed;
    } catch (e) {
      console.error(`[STORAGE] JSON parse failed for ${rel}: ${e?.message}`);
      return fallback;
    }
  } catch (err) {
    console.error(`[STORAGE] load_file error for ${rel}:`, err?.message || err);
    // Legacy local fallback (best-effort only; avoid in production)
    try {
      const { readFile } = await import('fs/promises');
      const p = legacyDefaults[
        Object.entries(files).find(([, v]) => v === rel)?.[0] || ''
      ] || rel;
      const txt = await readFile(p, 'utf-8');
      const parsed = JSON.parse(txt);
      console.warn(`[STORAGE] Fallback read succeeded for ${rel} → ${p}`);
      return parsed;
    } catch {
      return fallback;
    }
  }
}

/* -----------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

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
  const data = await readJson(files.linked_decks, {});
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
    .sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
}

/**
 * Loads master card list from logic/CoreMasterReference.json and normalizes entries.
 * Ensures array of objects with fields: { card_id, name, rarity, type, image }
 * Skips #000 in callers.
 */
export async function loadMaster() {
  const raw = await readJson(files.master_cards, []);
  const arr = Array.isArray(raw) ? raw : (raw.cards || []);
  // Normalize: card_id must be 3-digit string
  return arr.map(c => {
    const id3 = pad3(c.card_id ?? c.number ?? c.id ?? '');
    const safe = (s, fallback) => String(s || fallback).replace(/[^a-zA-Z0-9._-]/g, '');
    return {
      card_id: id3,
      name: c.name ?? `Card ${id3}`,
      rarity: c.rarity ?? 'Common',
      type: c.type ?? 'Unknown',
      image:
        c.image ??
        c.filename ??
        `${id3}_${safe(c.name, 'Card')}_${safe(c.type, 'Unknown')}.png`,
    };
  });
}

/**
 * Returns { wins, losses, coins } for the user.
 */
export async function getUserStats(userId) {
  const [playerData, bank] = await Promise.all([
    readJson(files.player_data, {}),
    readJson(files.coin_bank, {})
  ]);

  const wins = Number(playerData?.[userId]?.wins ?? 0) || 0;
  const losses = Number(playerData?.[userId]?.losses ?? 0) || 0;
  const coins = Number(bank?.[userId] ?? 0) || 0;

  return { wins, losses, coins };
}
