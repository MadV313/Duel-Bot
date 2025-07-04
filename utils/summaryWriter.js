// utils/summaryWriter.js

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Writes a summary JSON file for a completed duel.
 * @param {Object} duelState - Final duel state containing both players and optional wager
 * @param {string} winnerId - Discord ID of the winning player
 * @returns {Promise<string>} - The generated duelId used for the summary file
 */
export async function writeDuelSummary(duelState, winnerId) {
  const duelId = uuidv4();
  const timestamp = new Date().toISOString();

  const { player1, player2 } = duelState.players;

  const summary = {
    duelId,
    winner: winnerId === player1.discordId ? 'player1' : 'player2',
    timestamp,
    wager: duelState.wagerAmount ? { amount: duelState.wagerAmount } : null,
    players: {
      player1: {
        discordId: player1.discordId,
        discordName: player1.discordName || 'Player 1',
        hp: player1.hp,
        cardsPlayed: player1.cardsPlayed || 0,
        damageDealt: player1.damageDealt || 0
      },
      player2: {
        discordId: player2.discordId,
        discordName: player2.discordName || 'Player 2',
        hp: player2.hp,
        cardsPlayed: player2.cardsPlayed || 0,
        damageDealt: player2.damageDealt || 0
      }
    },
    events: [
      `${player1.discordName || 'Player 1'} played ${player1.cardsPlayed || 0} cards.`,
      `${player2.discordName || 'Player 2'} played ${player2.cardsPlayed || 0} cards.`,
      `${player1.discordName || 'Player 1'} dealt ${player1.damageDealt || 0} damage.`,
      `${player2.discordName || 'Player 2'} dealt ${player2.damageDealt || 0} damage.`
    ]
  };

  const filePath = path.resolve('./data/summarys', `${duelId}.json`);

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(summary, null, 2));
    console.log(`✅ Summary saved: ${filePath}`);
    return duelId;
  } catch (err) {
    console.error(`❌ Failed to save duel summary: ${err.message}`);
    throw new Error(`Failed to save duel summary: ${err.message}`);
  }
}
