// utils/cardPicker.js
//
// Persistent-data–ready version.
// Uses remote CoreMasterReference.json via storageClient when available,
// falls back to local file. All other logic & rarity weighting retained.

import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { load_file } from './storageClient.js';  // ✅ persistent data repo support

// ✅ Default weights
const rarityWeights = config.rarityWeights || {
  Common: 5,
  Uncommon: 3,
  Rare: 2,
  Legendary: 1,
};

// ✅ Core data path (local fallback)
const corePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

let allCards = [];

/**
 * Load CoreMasterReference from remote or local.
 * Populates the allCards array excluding #000 back card.
 */
async function loadCards() {
  try {
    // --- Attempt remote first ---
    const remoteData = await load_file('logic/CoreMasterReference.json').catch(() => null);
    if (remoteData) {
      allCards = Array.isArray(remoteData)
        ? remoteData.filter(c => c.card_id !== '000')
        : [];
      console.log(`📦 [CardPicker] Loaded ${allCards.length} cards from remote CoreMasterReference`);
      return;
    }

    // --- Fallback to local file ---
    const raw = fs.readFileSync(corePath, 'utf-8');
    const parsed = JSON.parse(raw);
    allCards = parsed.filter(card => card.card_id !== '000');
    console.log(`📦 [CardPicker] Loaded ${allCards.length} cards locally from CoreMasterReference`);
  } catch (err) {
    console.error('❌ [CardPicker] Failed to load CoreMasterReference:', err.message);
    allCards = [];
  }
}

/**
 * 🎲 Pick one card using weighted rarity distribution
 * @returns {object} randomly selected card
 */
function pickOneWeighted() {
  if (!allCards.length) {
    console.warn('⚠️ [CardPicker] No cards loaded; returning placeholder.');
    return { card_id: '000', name: 'Unknown Card', rarity: 'Common' };
  }

  const weightedPool = [];
  for (const card of allCards) {
    const weight = rarityWeights[card.rarity] || 1;
    for (let i = 0; i < weight; i++) weightedPool.push(card);
  }

  // Fisher–Yates shuffle
  for (let i = weightedPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weightedPool[i], weightedPool[j]] = [weightedPool[j], weightedPool[i]];
  }

  const index = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[index];
}

/**
 * 📦 Pick N weighted cards (duplicates allowed)
 * @param {number} count
 * @returns {Array} array of card objects
 */
export function weightedRandomCards(count = 3) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(pickOneWeighted());
  }
  return result;
}

/**
 * Initialize card pool before first use.
 * Call this at app startup (server.js or route init).
 */
export async function initCardPicker() {
  await loadCards();
}

export { allCards };
