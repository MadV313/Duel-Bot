// logic/cardEffectHandler.js

import { duelState } from './duelState.js';

export function applyCardEffect(playerKey, card) {
  const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
  const player = duelState.players[playerKey];
  const opponent = duelState.players[opponentKey];

  if (!card || !card.cardId) {
    console.warn('No valid card provided for effect resolution.');
    return;
  }

  const effects = card.logicActions || [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'damage':
        opponent.hp = Math.max(0, opponent.hp - effect.value);
        console.log(`${card.cardId} dealt ${effect.value} damage to ${opponentKey}`);
        break;

      case 'heal':
        player.hp = Math.min(200, player.hp + effect.value);
        console.log(`${card.cardId} healed ${effect.value} HP for ${playerKey}`);
        break;

      case 'draw':
        for (let i = 0; i < effect.value; i++) {
          if (player.hand.length < 4 && player.deck.length > 0) {
            const draw = player.deck.shift();
            player.hand.push(draw);
            console.log(`${playerKey} drew card ${draw.cardId}`);
          }
        }
        break;

      case 'force_discard':
        for (let i = 0; i < effect.value; i++) {
          if (opponent.hand.length > 0) {
            const discarded = opponent.hand.shift();
            opponent.discardPile.push(discarded);
            console.log(`${opponentKey} discarded card ${discarded.cardId}`);
          }
        }
        break;

      case 'steal':
        if (opponent.hand.length > 0 && player.hand.length < 4) {
          const stolen = opponent.hand.shift();
          player.hand.push(stolen);
          console.log(`${playerKey} stole card ${stolen.cardId}`);
        }
        break;

      case 'reveal_hand':
        console.log(`${playerKey} revealed ${opponentKey}'s hand:`, opponent.hand.map(c => c.cardId));
        break;

      // Add more types here as needed...
      
      default:
        console.warn(`Unhandled effect type: ${effect.type}`);
    }
  }
}
