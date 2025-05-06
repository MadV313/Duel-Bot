// logic/drawCard.js

import { duelState } from './duelState.js';

export function drawCard(playerKey) {
  const player = duelState.players[playerKey];
  if (!player) throw new Error(`Invalid player key: ${playerKey}`);

  if (player.deck.length === 0) {
    console.warn(`${playerKey} has no cards left in their deck. Losing 10 HP as penalty.`);
    player.hp = Math.max(0, player.hp - 10);
    return null;
  }

  if (player.hand.length >= 4) {
    console.warn(`${playerKey}'s hand is full. Cannot draw more cards.`);
    return null;
  }

  const drawnCard = player.deck.shift();
  player.hand.push(drawnCard);

  console.log(`${playerKey} drew card: ${drawnCard.cardId}`);
  return drawnCard;
}
