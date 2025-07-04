// logic/animationTrigger.js

import { duelState } from './duelState.js';

/**
 * Triggers a named animation effect for a given player.
 * Supported types: fire, poison, heal, trap, bullet,
 * infected, shield, loot, explosion, attack
 * 
 * @param {string} type - Type of animation to trigger
 * @param {'player1' | 'player2' | 'bot'} playerKey - Player to assign the animation to
 */
export function triggerAnimation(type, playerKey) {
  const supportedTypes = [
    'fire', 'poison', 'heal', 'trap', 'bullet',
    'infected', 'shield', 'loot', 'explosion', 'attack'
  ];

  if (!supportedTypes.includes(type)) {
    console.warn(`[Animation] Unsupported animation type: ${type}`);
    return;
  }

  if (!['player1', 'player2', 'bot'].includes(playerKey)) {
    console.error(`[Animation] Invalid player key: ${playerKey}`);
    return;
  }

  const player = duelState.players?.[playerKey];
  if (!player) {
    console.error(`[Animation] Player not found in duelState: ${playerKey}`);
    return;
  }

  if (!Array.isArray(player.animations)) {
    player.animations = [];
  }

  player.animations.push({
    type,
    timestamp: Date.now()
  });

  console.log(`[Animation] ✅ Triggered '${type}' animation for ${playerKey}`);
}
