// utils/writeDuelSummary.js

import fs from 'fs';
import path from 'path';

/**
 * Write a duel summary to the summaries directory for the Summary UI.
 * @param {string} duelId - Unique ID for this duel (timestamp or UUID)
 * @param {string} winnerId - Discord ID of the winning player
 * @param {object} player1 - Stats for player1 { discordId, cardsPlayed, damageDealt }
 * @param {object} player2 - Stats for player2 { discordId, cardsPlayed, damageDealt }
 */
export function writeDuelSummary(duelId, winnerId, player1, player2) {
  const summary = {
    duelId,
    winner: winnerId === player1.discordId ? 'player1' : 'player2',
    player1,
    player2,
    timestamp: new Date().toISOString()
  };

  const filePath = path.join(
    process.cwd(),
    'Duel-Summary-UI',
    'data',
    'summaries', // ✅ Corrected folder name
    `${duelId}.json`
  );

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
    console.log(`✅ Duel summary saved: ${filePath}`);
  } catch (err) {
    console.error('❌ Failed to write duel summary:', err);
  }
}
