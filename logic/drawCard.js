// logic/drawCard.js

import { duelState } from './duelState.js';

/** Fisher–Yates */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw N cards. If the deck is empty and allowRecycle is true,
 * move a SHUFFLED COPY of discardPile into deck (then clear discardPile).
 * Never draws directly from discardPile.
 *
 * Hand limit is 4. Deck exhaustion (deck AND discard empty) → lose 10 HP.
 *
 * @param {'player1'|'player2'|'bot'} playerKey
 * @param {number} count
 * @param {{allowRecycle?: boolean}} opts
 * @returns {{drawn: object[], exhausted: boolean}}
 */
export function drawCard(playerKey, count = 1, opts = {}) {
  const { allowRecycle = true } = opts;

  const player = duelState.players[playerKey];
  if (!player) throw new Error(`❌ Invalid player key: ${playerKey}`);

  const drawn = [];

  for (let k = 0; k < count; k++) {
    // Respect hand limit
    if (player.hand.length >= 4) {
      console.warn(`🛑 ${playerKey}'s hand full (4). Stopped drawing.`);
      break;
    }

    // If deck empty, try recycle from discard (shuffle!)
    if (player.deck.length === 0 && allowRecycle && player.discardPile.length > 0) {
      player.deck = shuffle(player.discardPile);
      player.discardPile = []; // clear; avoid aliasing
      console.log(`[draw] ♻️ Recycled discard → deck for ${playerKey} (${player.deck.length} cards).`);
    }

    // If still empty → exhaustion penalty
    if (player.deck.length === 0) {
      console.warn(`⚠️ ${playerKey} deck exhausted. -10 HP penalty.`);
      player.hp = Math.max(0, (player.hp || 0) - 10);
      return { drawn, exhausted: true };
    }

    const next = player.deck.shift(); // always from DECK
    if (!next) break;

    player.hand.push(next);
    drawn.push(next);
    console.log(`🎴 ${playerKey} drew: ${next.cardId}`);
  }

  return { drawn, exhausted: false };
}
