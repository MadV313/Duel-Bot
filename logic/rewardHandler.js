// logic/rewardHandler.js

import fs from 'fs';
import path from 'path';

const coinBankPath = path.resolve('./data/coin_bank.json');

/**
 * Transfers the wagered coins from loser to winner.
 * @param {string} winnerId - Discord ID of the winning player.
 * @param {string} loserId - Discord ID of the losing player.
 * @param {number} wager - Amount of coins wagered by each player.
 */
export function rewardDuelWinner(winnerId, loserId, wager) {
  if (!wager || wager <= 0) {
    console.log("No wager placed — skipping reward.");
    return;
  }

  let coinBank = {};
  try {
    if (fs.existsSync(coinBankPath)) {
      coinBank = JSON.parse(fs.readFileSync(coinBankPath, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read coin bank during reward:', err);
    return;
  }

  // Deduct from loser
  coinBank[loserId] = Math.max((coinBank[loserId] || 0) - wager, 0);
  // Give to winner
  coinBank[winnerId] = (coinBank[winnerId] || 0) + wager;

  try {
    fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    console.log(`✅ Transferred ${wager} coins from ${loserId} to ${winnerId}`);
  } catch (err) {
    console.error('Failed to write coin bank during reward:', err);
  }
}
