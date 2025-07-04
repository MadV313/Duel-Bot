// utils/turnUtils.js

let currentTurn = 1;

/**
 * Start a new turn by incrementing the current turn number.
 */
export function startNewTurn() {
  currentTurn++;
  console.log(`🔄 New turn started: Turn ${currentTurn}`);
}

/**
 * Get the current turn number.
 * @returns {number} The current turn
 */
export function getCurrentTurn() {
  return currentTurn;
}

/**
 * Reset the turn counter back to turn 1.
 */
export function resetTurn() {
  currentTurn = 1;
  console.log('🔁 Turn reset to 1');
}
