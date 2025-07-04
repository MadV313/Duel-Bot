// logic/updateDuelUI.js

import fs from 'fs';
import path from 'path';

const duelUIPath = path.resolve('./public/data/duel_ui_state.json');

/**
 * Writes current duel state to duel_ui_state.json for frontend rendering.
 * Called after every state change (draw, play, discard, etc.).
 *
 * @param {Object} duelState - Global duel state object
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
    console.log('✅ Duel UI state written to duel_ui_state.json');
  } catch (err) {
    console.error('❌ Failed to write Duel UI state:', err);
  }
}

/**
 * Prepares a player's state for Duel UI rendering.
 *
 * @param {Object} player - One of the players in duelState.players
 * @returns {Object} - Cleaned structure for frontend use
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
    discardPile: player.discardPile.length
  };
}
