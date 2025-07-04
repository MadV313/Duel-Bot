// utils/cardPicker.js
import fs from 'fs';
import path from 'path';

// ✅ Safe config.json load without import assertions
const configPath = path.join(process.cwd(), 'config.json');
let config = {};

try {
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(rawConfig);
} catch (err) {
  console.error('❌ Failed to load config.json:', err);
}

// ✅ Determine the core card path
const corePath = path.resolve(config.cardDataPath || './logic/CoreMasterReference.json');

// ✅ Load and filter cards (exclude placeholder #000)
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
  allCards = parsed.filter(c => c.card_id !== '000');
} catch (err) {
  console.error('❌ Failed to load CoreMasterReference:', err);
  allCards = [];
}

// 🎲 Helper: Picks one weighted card based on rarity
function pickOneWeighted() {
  const weightedPool = [];

  for (const card of allCards) {
    const weight = rarityWeights[card.rarity] || 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(card);
    }
  }

  // Optional: Shuffle for enhanced randomness
  for (let i = weightedPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [weightedPool[i], weightedPool[j]] = [weightedPool[j], weightedPool[i]];
  }

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
}

// 📦 Exported: Picks N weighted cards
export function weightedRandomCards(count = 3) {
  const result = [];
  while (result.length < count) {
    result.push(pickOneWeighted());
  }
  return result;
}
