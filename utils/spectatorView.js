// spectatorView.js

import { duelState } from './duelState.js';

/**
 * Update the spectator view with the current duel state.
 * @param {string} duelId - The ID of the duel being viewed.
 */
export function updateSpectatorView(duelId) {
  const duel = duelState[duelId];
  if (!duel) {
    console.log('Duel not found.');
    return;
  }

  // Assuming duelState holds the necessary information to display duel progress
  console.log(`Duel between ${duel.player1.username} and ${duel.player2.username}`);
  console.log(`Current player: ${duel.currentPlayer}`);
  console.log(`Player 1 HP: ${duel.player1.hp}, Player 2 HP: ${duel.player2.hp}`);

  // Could also be used to update a spectator UI element
  // e.g., document.getElementById('duelStatus').innerText = `Current player: ${duel.currentPlayer}`;
}

/**
 * Start watching a duel as a spectator
 * @param {string} duelId - The ID of the duel to watch
 */
export function startWatching(duelId) {
  console.log(`Spectator started watching duel ${duelId}`);
  updateSpectatorView(duelId);

  // Possibly set an interval to keep updating the spectator view
  setInterval(() => updateSpectatorView(duelId), 5000); // Updates every 5 seconds
}
