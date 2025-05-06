import fs from 'fs';
import path from 'path';
import { config } from './config.json'; // Assuming we have a config.json for dynamic values

const filePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

let cardData = {};

try {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  parsed.forEach(card => {
    cardData[card.cardId] = card.rarity;
  });
} catch (err) {
  console.error('Failed to load card rarity data:', err);
  cardData = {}; // Default to empty if error occurs
}

/**
 * Returns the rarity for a given card ID
 * @param {string} cardId - The 3-digit card ID (e.g. '045')
 * @returns {'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Unknown'}
 */
export function getCardRarity(cardId) {
  return cardData[cardId] || 'Unknown';
}
