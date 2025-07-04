// utils/cardPicker.js
import fs from 'fs';
import path from 'path';

// ✅ Load config.json safely
const configPath = path.resolve(process.cwd(), 'config.json');
let config = {};

try {
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(rawConfig);
} catch (err) {
  console.error('❌ Failed to load config.json:', err);
}

// ✅ Core data path
const corePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

// ✅ Rarity weight fallback
const rarityWeights = config.rarityWeights || {
  Common: 5,
  Uncommon: 3,
  Rare: 2,
  Legendary: 1,
};

let allCards = [];

try {
  const raw = fs.readFileSync(corePath, 'utf-8');
  const parsed = JSON.parse(raw);
  allCards = parsed.filter(card => card.card_id !== '000');
  console.log(`📦 Loaded ${allCards.length} cards from CoreMasterReference.`);
} catch (err) {
  console.error('❌ Failed to load CoreMasterReference:', err);
  allCards = [];
}

/**
 * 🎲 Pick one card using weighted rarity distribution
 * @returns {object} randomly selected card
 */
function pickOneWeighted() {
  const weightedPool = [];

  for (const card of allCards) {
    const weight = rarityWeights[card.rarity] || 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(card);
    }
  }

  // Optional: Shuffle (Fisher-Yates)
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
