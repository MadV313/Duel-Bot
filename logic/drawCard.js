// logic/drawCard.js

import { duelState } from './duelState.js';

/**
 * Draws a card for the given player if allowed.
 * Enforces hand limit and deck exhaustion penalty.
 * @param {string} playerKey - 'player1' | 'player2' | 'bot'
 * @returns {object|null} The drawn card, or null if no draw occurred.
 */
export function drawCard(playerKey) {
  const player = duelState.players[playerKey];
  if (!player) throw new Error(`❌ Invalid player key: ${playerKey}`);

  if (player.deck.length === 0) {
    console.warn(`⚠️ ${playerKey} has no cards left. Deck exhausted. Losing 10 HP.`);
    player.hp = Math.max(0, player.hp - 10);
    return null;
  }

  if (player.hand.length >= 4) {
    console.warn(`🛑 ${playerKey}'s hand is full (4 cards). Cannot draw more.`);
    return null;
  }

  const drawnCard = player.deck.shift();
  player.hand.push(drawnCard);

  console.log(`🎴 ${playerKey} drew card: ${drawnCard.cardId}`);
  return drawnCard;
}
