// utils/writeDuelSummary.js

// ⬇️ switched from local fs to remote storage client
import { saveJSON, PATHS } from '../utils/storageClient.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';

/**
 * Write a duel summary to the summaries directory for the Summary UI.
 * @param {string} duelId - Unique ID for this duel (timestamp or UUID)
 * @param {string} winnerId - Discord ID of the winning player
 * @param {object} player1 - Stats for player1 { discordId, cardsPlayed, damageDealt }
 * @param {object} player2 - Stats for player2 { discordId, cardsPlayed, damageDealt }
 */
export async function writeDuelSummary(duelId, winnerId, player1, player2) {
  const summary = {
    duelId,
    winner: winnerId === player1.discordId ? 'player1' : 'player2',
    createdAt: new Date().toISOString(),
    players: {
      player1: {
        discordId: player1.discordId,
        cardsPlayed: player1.cardsPlayed || 0,
        damageDealt: player1.damageDealt || 0
      },
      player2: {
        discordId: player2.discordId,
        cardsPlayed: player2.cardsPlayed || 0,
        damageDealt: player2.damageDealt || 0
      }
    }
  };

  // Persist to remote summaries/<duelId>.json
  const filePath = PATHS.summaryFile(duelId);

  try {
    await saveJSON(filePath, summary);
    L.storage(`Saved duel summary: ${filePath}`);
  } catch (err) {
    console.error('❌ Failed to write duel summary:', err);
    try {
      await adminAlert(globalThis.client || null, process.env.PAYOUTS_CHANNEL_ID, `${filePath} save failed: ${err.message}`);
    } catch {}
  }
}
