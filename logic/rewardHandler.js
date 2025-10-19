// logic/rewardHandler.js

// ⬇️ switched from local fs to remote storage client
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';

/**
 * 🪙 Reward the duel winner with the total pot (2x wager).
 * Assumes both players already paid their wager before the match.
 *
 * @param {string} winnerId - Discord user ID of the winner.
 * @param {number} wager - Amount wagered per player (e.g., 5 coins each).
 */
export async function rewardDuelWinner(winnerId, wager) {
  if (!wager || wager <= 0) {
    console.warn('⚠️ rewardDuelWinner called with invalid wager:', wager);
    return;
  }
  if (!winnerId) {
    console.warn('⚠️ rewardDuelWinner called without winnerId');
    return;
  }

  let coinBank = {};
  try {
    coinBank = await loadJSON(PATHS.coinBank);
    L.storage(`Loaded coin bank.`);
  } catch (err) {
    console.error('❌ Failed to read coin bank for reward payout:', err);
    return;
  }

  // 🪙 Reward full pot (2x wager)
  coinBank[winnerId] = (coinBank[winnerId] || 0) + wager * 2;

  try {
    await saveJSON(PATHS.coinBank, coinBank);
    console.log(`✅ Rewarded ${wager * 2} coins to winner ${winnerId}`);
  } catch (err) {
    console.error('❌ Failed to write reward payout to coin bank:', err);
    try {
      await adminAlert(globalThis.client || null, process.env.PAYOUTS_CHANNEL_ID, `coin_bank.json save failed: ${err.message}`);
    } catch {}
  }
}
