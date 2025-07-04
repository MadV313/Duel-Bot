// utils/cardpicker.js
import fs from 'fs';
import path from 'path';
import config from '../config.json'; // ✅ Correct path from /utils/

const corePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

const rarityWeights = config.rarityWeights || {
  Common: 5,
  Uncommon: 3,
  Rare: 2,
  Legendary: 1
};

let allCards = [];

try {
  const raw = fs.readFileSync(corePath);
  const parsed = JSON.parse(raw);
  allCards = parsed.filter(c => c.card_id !== '000'); // exclude placeholder
} catch (err) {
  console.error('Failed to load CoreMasterReference:', err);
  allCards = [];  // Default to empty if error occurs
}

// Helper: Returns one weighted random card (full card object)
function pickOneWeighted() {
  const weightedPool = [];

  for (const card of allCards) {
    const weight = rarityWeights[card.rarity] || 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(card);  // Push full card object instead of just card_id
    }
  }

  // Shuffle the weighted pool for better randomness
  for (let i = weightedPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weightedPool[i], weightedPool[j]] = [weightedPool[j], weightedPool[i]]; // Swap
  }

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
}

// Exported: Picks N random cards by weight (full card objects)
export function weightedRandomCards(count = 3) {
  const result = [];
  while (result.length < count) {
    const pick = pickOneWeighted();
    result.push(pick);
  }
  return result;  // Returns an array of full card objects
}
