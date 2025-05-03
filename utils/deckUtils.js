// utils/deckUtils.js

import fs from 'fs';
import path from 'path';

const decksPath = path.join(process.cwd(), 'data', 'linked_decks.json');

/**
 * Updates a player's deck data in linked_decks.json
 * @param {string} userId - The Discord user ID
 * @param {object} update - An object with fields to update (e.g., deck, collection, coins)
 */
export function updatePlayerDeck(userId, update) {
  try {
    const data = JSON.parse(fs.readFileSync(decksPath, 'utf8'));

    if (!data[userId]) {
      data[userId] = {
        deck: [],
        collection: [],
        coins: 0
      };
    }

    // Merge updates into player object
    Object.assign(data[userId], update);

    fs.writeFileSync(decksPath, JSON.stringify(data, null, 2));
    console.log(`Updated deck data for user ${userId}`);
  } catch (err) {
    console.error(`Failed to update deck for user ${userId}:`, err);
  }
}
