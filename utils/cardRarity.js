// utils/cardRarity.js

import fs from 'fs';
import path from 'path';
import { config } from './config.js'; // ✅ Updated to centralized config.js

const filePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

const cardData = {};

try {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  parsed.forEach(card => {
    if (card.card_id && card.rarity) {
      cardData[card.card_id] = card.rarity;
    }
  });

  console.log(`✅ Loaded rarity data for ${Object.keys(cardData).length} cards.`);
} catch (err) {
  console.error('❌ Failed to load card rarity data:', err);
}

/**
 * Returns the rarity for a given card ID
 * @param {string} cardId - The 3-digit card ID (e.g. '045')
 * @returns {'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Unknown'}
 */
export function getCardRarity(cardId) {
  return cardData[cardId] || 'Unknown';
}
