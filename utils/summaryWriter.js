// utils/summaryWriter.js
//
// Writes a duel summary JSON to persistent storage.
// - Replaces local fs writes with storageClient.saveJSON()
// - No local fallbacks per checklist
// - Clear [STORAGE] logs
// - Returns the generated duelId

import { v4 as uuidv4 } from 'uuid';
import { saveJSON } from './storageClient.js';

/**
 * Writes a summary JSON file for a completed duel.
 * @param {Object} duelState - Final duel state containing both players and optional wager
 * @param {string} winnerId - Discord ID of the winning player
 * @returns {Promise<string>} - The generated duelId used for the summary file
 */
export async function writeDuelSummary(duelState, winnerId) {
  const duelId = uuidv4();
  const timestamp = new Date().toISOString();

  // Defensive reads in case caller passes slightly different shapes
  const p1 = duelState?.players?.player1 || {};
  const p2 = duelState?.players?.player2 || duelState?.players?.bot || {};

  const winnerKey = winnerId === p1.discordId ? 'player1' : 'player2';

  const summary = {
    duelId,
    winner: winnerKey,
    timestamp,
    wager: duelState?.wagerAmount ? { amount: duelState.wagerAmount } : null,
    players: {
      player1: {
        discordId: p1.discordId,
        discordName: p1.discordName || 'Player 1',
        hp: p1.hp,
        cardsPlayed: p1.cardsPlayed || 0,
        damageDealt: p1.damageDealt || 0,
      },
      player2: {
        discordId: p2.discordId,
        discordName: p2.discordName || 'Player 2',
        hp: p2.hp,
        cardsPlayed: p2.cardsPlayed || 0,
        damageDealt: p2.damageDealt || 0,
      },
    },
    events: [
      `${p1.discordName || 'Player 1'} played ${p1.cardsPlayed || 0} cards.`,
      `${p2.discordName || 'Player 2'} played ${p2.cardsPlayed || 0} cards.`,
      `${p1.discordName || 'Player 1'} dealt ${p1.damageDealt || 0} damage.`,
      `${p2.discordName || 'Player 2'} dealt ${p2.damageDealt || 0} damage.`,
    ],
  };

  // Persist remotely (e.g., https://.../summaries/<duelId>.json)
  const filename = `summaries/${duelId}.json`;
  try {
    await saveJSON(filename, summary);
    console.log(`[STORAGE] Summary saved: ${filename}`);
    return duelId;
  } catch (e) {
    console.error(`[STORAGE] Failed to save duel summary (${filename}):`, e?.message || e);
    throw new Error(`Failed to save duel summary: ${e?.message || e}`);
  }
}
