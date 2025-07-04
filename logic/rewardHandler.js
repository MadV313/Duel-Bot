// logic/rewardHandler.js

import fs from 'fs';
import path from 'path';

const coinBankPath = path.resolve('./data/coin_bank.json');

/**
 * 🪙 Reward the duel winner with the total pot (2x wager).
 * Assumes both players already paid their wager before the match.
 *
 * @param {string} winnerId - Discord user ID of the winner.
 * @param {number} wager - Amount wagered per player (e.g., 5 coins each).
 */
export function rewardDuelWinner(winnerId, wager) {
  if (!wager || wager <= 0) {
    console.log('⚠️ No wager to distribute.');
    return;
  }

  let coinBank = {};
  try {
    if (fs.existsSync(coinBankPath)) {
      coinBank = JSON.parse(fs.readFileSync(coinBankPath, 'utf-8'));
    }
  } catch (err) {
    console.error('❌ Failed to read coin bank for reward payout:', err);
    return;
  }

  // 🪙 Reward full pot (2x wager)
  coinBank[winnerId] = (coinBank[winnerId] || 0) + wager * 2;

  try {
    fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    console.log(`✅ Rewarded ${wager * 2} coins to winner ${winnerId}`);
  } catch (err) {
    console.error('❌ Failed to write reward payout to coin bank:', err);
  }
}
