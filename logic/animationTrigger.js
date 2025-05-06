Here is a complete `animationTrigger.js` file designed to trigger visual effects in your DayZ CCG duel system. It maps animation types to embed updates or frontend UI signals, and works with both Discord and web-based UIs.

---

### **`animationTrigger.js`**

```js
// logic/animationTrigger.js

import { duelState } from './duelState.js';

/**
 * Triggers a named animation effect for a given player.
 * Supported types: fire, poison, heal, trap, bullet, infected, shield, loot, explosion, attack
 */
export function triggerAnimation(type, playerKey) {
  const supported = [
    'fire', 'poison', 'heal', 'trap', 'bullet',
    'infected', 'shield', 'loot', 'explosion', 'attack'
  ];

  if (!supported.includes(type)) {
    console.warn(`Unsupported animation type: ${type}`);
    return;
  }

  if (!['player1', 'player2', 'bot'].includes(playerKey)) {
    console.error(`Invalid player key: ${playerKey}`);
    return;
  }

  // Add an animation queue entry for the frontend
  if (!duelState.players[playerKey].animations) {
    duelState.players[playerKey].animations = [];
  }

  duelState.players[playerKey].animations.push({
    type,
    timestamp: Date.now()
  });

  console.log(`Animation triggered: ${type} for ${playerKey}`);
}
