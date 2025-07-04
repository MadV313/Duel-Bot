// utils/deckUtils.js

import fs from 'fs';
import path from 'path';

const decksPath = path.resolve('data', 'linked_decks.json');

/**
 * Update or create a player's deck entry in linked_decks.json.
 * Merges new fields into existing data if found.
 *
 * @param {string} userId - Discord user ID
 * @param {object} update - Partial update object (e.g. { deck, coins, collection })
 */
export function updatePlayerDeck(userId, update) {
  try {
    let data = { players: [] };

    if (fs.existsSync(decksPath)) {
      const raw = fs.readFileSync(decksPath, 'utf8');
      data = JSON.parse(raw);
    }

    const index = data.players.findIndex(p => p.discordId === userId);

    if (index !== -1) {
      // Update existing entry
      data.players[index] = {
        ...data.players[index],
        ...update
      };
    } else {
      // Add new entry
      data.players.push({
        discordId: userId,
        ...update
      });
    }

    fs.writeFileSync(decksPath, JSON.stringify(data, null, 2));
    console.log(`✅ Deck data updated for user: ${userId}`);
  } catch (err) {
    console.error(`❌ Failed to update deck for ${userId}: ${err.message}`);
    console.error(err.stack);
  }
}

/**
 * Get a player's full card collection from linked_decks.json.
 *
 * @param {string} userId - Discord user ID
 * @returns {Array} The collection array, or empty if not found.
 */
export function getPlayerCollection(userId) {
  try {
    if (fs.existsSync(decksPath)) {
      const raw = fs.readFileSync(decksPath, 'utf8');
      const data = JSON.parse(raw);
      const player = data.players.find(p => p.discordId === userId);
      return player?.collection || [];
    }
  } catch (err) {
    console.error(`❌ Failed to get collection for ${userId}: ${err.message}`);
  }
  return [];
}
