// logic/rewardHandler.js

import fs from 'fs';
import path from 'path';

const coinBankPath = path.resolve('./data/coin_bank.json');

/**
 * Rewards the winner with the full wager pool (2x wager).
 * Assumes both players' wagers were already deducted on duel start.
 * @param {string} winnerId - Discord ID of the winner.
 * @param {number} wager - Amount wagered by each player.
 */
export function rewardDuelWinner(winnerId, wager) {
  if (!wager || wager <= 0) {
    console.log('No wager to reward.');
    return;
  }

  let coinBank = {};
  try {
    if (fs.existsSync(coinBankPath)) {
      coinBank = JSON.parse(fs.readFileSync(coinBankPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read coin bank for reward payout:', err);
    return;
  }

  // Add full pot (2x wager) to winner
  coinBank[winnerId] = (coinBank[winnerId] || 0) + wager * 2;

  try {
    fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    console.log(`✅ Rewarded ${wager * 2} coins to winner ${winnerId}`);
  } catch (err) {
    console.error('Failed to write reward payout to coin bank:', err);
  }
}
