// logic/updateDuelUI.js

import fs from 'fs';
import path from 'path';

const duelUIPath = path.resolve('./public/data/duel_ui_state.json');

/**
 * Updates the Duel UI with the current duel state.
 * This file is read by the frontend to render current HP, cards, turn, etc.
 * 
 * @param {Object} duelState - The entire duel state object
 */
export function updateDuelUI(duelState) {
  const payload = {
    timestamp: new Date().toISOString(),
    currentPlayer: duelState.currentPlayer,
    winner: duelState.winner || null,
    player1: formatPlayer(duelState.players.player1),
    player2: formatPlayer(duelState.players.player2 || duelState.players.bot),
  };

  try {
    fs.writeFileSync(duelUIPath, JSON.stringify(payload, null, 2));
    console.log('Duel UI updated.');
  } catch (err) {
    console.error('Failed to update Duel UI:', err);
  }
}

/**
 * Formats a player object for frontend rendering.
 * @param {Object} player 
 * @returns Formatted player payload
 */
function formatPlayer(player) {
  return {
    discordId: player.discordId || 'bot',
    hp: player.hp,
    hand: player.hand.map(card => ({
      cardId: card.cardId || '000',
      isFaceDown: card.isFaceDown || false
    })),
    field: player.field.map(card => ({
      cardId: card.cardId || '000',
      isFaceDown: card.isFaceDown || false
    })),
    discardPile: player.discardPile.length,
  };
}
