// utils/turnUtils.js

let currentTurn = 1;

// Start a new turn
export function startNewTurn() {
  currentTurn++;
  console.log(`New turn started: Turn ${currentTurn}`);
}

// Get the current turn number
export function getCurrentTurn() {
  return currentTurn;
}

// Reset the turn number (if needed)
export function resetTurn() {
  currentTurn = 1;
  console.log('Turn reset to 1');
}
