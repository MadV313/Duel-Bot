import fs from 'fs';
import path from 'path';

const corePath = path.resolve('./logic/CoreMasterReference.json');

const rarityWeights = {
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
}

// Helper: Returns one weighted random card
function pickOneWeighted() {
  const weightedPool = [];

  for (const card of allCards) {
    const weight = rarityWeights[card.rarity] || 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(card.card_id);
    }
  }

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
}

// Exported: Picks N random cards by weight
export function weightedRandomCards(count = 3) {
  const result = [];
  while (result.length < count) {
    const pick = pickOneWeighted();
    result.push(pick);
  }
  return result;
}
