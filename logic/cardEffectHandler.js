// logic/cardEffectHandler.js

import { duelState } from './duelState.js';

/**
 * Apply effects of a played card.
 * @param {string} playerKey - 'player1' | 'player2' | 'bot'
 * @param {object} card - Card object containing logicActions
 */
export function applyCardEffect(playerKey, card) {
  const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
  const player = duelState.players[playerKey];
  const opponent = duelState.players[opponentKey];

  if (!card || !card.cardId) {
    console.warn('[Effect] ⚠️ No valid card provided.');
    return;
  }

  const effects = card.logicActions || [];
  if (!Array.isArray(effects)) {
    console.warn(`[Effect] ⚠️ No effects array found on card ${card.cardId}`);
    return;
  }

  for (const effect of effects) {
    switch (effect.type) {
      case 'damage':
        opponent.hp = Math.max(0, opponent.hp - effect.value);
        console.log(`[Effect] 💥 ${card.cardId} dealt ${effect.value} damage to ${opponentKey}`);
        break;

      case 'heal':
        player.hp = Math.min(200, player.hp + effect.value);
        console.log(`[Effect] ❤️ ${card.cardId} healed ${effect.value} HP for ${playerKey}`);
        break;

      case 'draw':
        for (let i = 0; i < effect.value; i++) {
          if (player.hand.length < 4 && player.deck.length > 0) {
            const drawn = player.deck.shift();
            player.hand.push(drawn);
            console.log(`[Effect] 🔄 ${playerKey} drew card ${drawn.cardId}`);
          }
        }
        break;

      case 'force_discard':
        for (let i = 0; i < effect.value; i++) {
          if (opponent.hand.length > 0) {
            const discarded = opponent.hand.shift();
            opponent.discardPile.push(discarded);
            console.log(`[Effect] 🗑️ ${opponentKey} discarded ${discarded.cardId}`);
          }
        }
        break;

      case 'steal':
        if (opponent.hand.length > 0 && player.hand.length < 4) {
          const stolen = opponent.hand.shift();
          player.hand.push(stolen);
          console.log(`[Effect] 🕵️ ${playerKey} stole card ${stolen.cardId}`);
        }
        break;

      case 'reveal_hand':
        console.log(`[Effect] 👁️ ${playerKey} sees ${opponentKey}'s hand:`, opponent.hand.map(c => c.cardId));
        break;

      // Future effect types
      default:
        console.warn(`[Effect] ❓ Unhandled effect type: ${effect.type}`);
    }
  }
}
