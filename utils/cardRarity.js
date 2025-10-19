// utils/cardRarity.js
//
// Persistent-data–ready version
// Tries to load rarity data remotely via storageClient before local fallback.
// Keeps full compatibility with config.js and previous getCardRarity() calls.

import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { load_file } from './storageClient.js'; // ✅ remote persistent-data support

const filePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

const cardData = {};

/**
 * Internal loader to populate rarity map
 * (tries remote first, then falls back to local)
 */
async function loadRarityData() {
  try {
    // --- Try remote persistent-data repo ---
    const remoteData = await load_file('logic/CoreMasterReference.json').catch(() => null);

    if (remoteData && Array.isArray(remoteData)) {
      for (const card of remoteData) {
        if (card.card_id && card.rarity) cardData[card.card_id] = card.rarity;
      }
      console.log(`✅ [CardRarity] Loaded rarity data for ${Object.keys(cardData).length} cards (remote).`);
      return;
    }

    // --- Local fallback ---
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    parsed.forEach(card => {
      if (card.card_id && card.rarity) cardData[card.card_id] = card.rarity;
    });
    console.log(`✅ [CardRarity] Loaded rarity data for ${Object.keys(cardData).length} cards (local).`);
  } catch (err) {
    console.error('❌ [CardRarity] Failed to load rarity data:', err.message);
  }
}

/**
 * Returns the rarity for a given card ID
 * @param {string} cardId - The 3-digit card ID (e.g. '045')
 * @returns {'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Unknown'}
 */
export function getCardRarity(cardId) {
  return cardData[cardId] || 'Unknown';
}

/**
 * Initialize the rarity table once at startup.
 * Safe to call multiple times; will reuse loaded data.
 */
export async function initCardRarity() {
  if (Object.keys(cardData).length > 0) return; // already loaded
  await loadRarityData();
}

export { cardData };
