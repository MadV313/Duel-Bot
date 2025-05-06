// utils/deckUtils.js

import fs from 'fs';
import path from 'path';

const decksPath = path.resolve('data', 'linked_decks.json');

/**
 * Updates a player's deck or metadata in linked_decks.json
 * @param {string} userId - The Discord user ID
 * @param {object} update - Fields to update (e.g., deck, coins, collection)
 */
export function updatePlayerDeck(userId, update) {
  try {
    let data = { players: [] };

    // Read the file and parse the JSON content
    if (fs.existsSync(decksPath)) {
      const rawData = fs.readFileSync(decksPath, 'utf8');
      data = JSON.parse(rawData);
    }

    const playerIndex = data.players.findIndex(p => p.discordId === userId);

    if (playerIndex !== -1) {
      // Merge updates into existing player
      data.players[playerIndex] = {
        ...data.players[playerIndex],
        ...update
      };
    } else {
      // Add new player if not found
      data.players.push({ discordId: userId, ...update });
    }

    // Write the updated data back to the file
    fs.writeFileSync(decksPath, JSON.stringify(data, null, 2));
    console.log(`Updated deck data for user ${userId}`);
  } catch (err) {
    // Enhanced error logging
    console.error(`Failed to update deck for user ${userId}: ${err.message}`);
    console.error(err.stack); // Stack trace for debugging
  }
}
