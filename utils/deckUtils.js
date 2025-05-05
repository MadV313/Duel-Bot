// utils/deckUtils.js

import fs from 'fs';
import path from 'path';

const decksPath = path.join(process.cwd(), 'data', 'linked_decks.json');

/**
 * Updates a player's deck or metadata in linked_decks.json
 * @param {string} userId - The Discord user ID
 * @param {object} update - Fields to update (e.g., deck, coins, collection)
 */
export function updatePlayerDeck(userId, update) {
  try {
    let data = { players: [] };

    if (fs.existsSync(decksPath)) {
      data = JSON.parse(fs.readFileSync(decksPath, 'utf8'));
    }

    const playerIndex = data.players.findIndex(p => p.discordId === userId);

    if (playerIndex !== -1) {
      // Merge updates into existing player
      data.players[playerIndex] = {
        ...data.players[playerIndex],
        ...update
      };
    } else {
      // Add new player
      data.players.push({ discordId: userId, ...update });
    }

    fs.writeFileSync(decksPath, JSON.stringify(data, null, 2));
    console.log(`Updated deck data for user ${userId}`);
  } catch (err) {
    console.error(`Failed to update deck for user ${userId}:`, err);
  }
}
