// utils/turnUtils.js
//
// Persistent turn tracking with remote storage + local cache.
// Fully backward-compatible with your previous API.

import { loadJSON, saveJSON } from './storageClient.js';
import { L } from './logs.js';

const TURN_FILE = 'turn_state.json';
let currentTurn = 1;
let loaded = false;

/**
 * Initialize the turn system by loading the last saved turn.
 */
export async function initTurnState() {
  try {
    const data = await loadJSON(TURN_FILE);
    if (data && typeof data.currentTurn === 'number') {
      currentTurn = data.currentTurn;
      loaded = true;
      L.duel(`🔄 Loaded persistent turn state: Turn ${currentTurn}`);
    } else {
      await saveJSON(TURN_FILE, { currentTurn });
      L.duel('📘 Created new turn_state.json with Turn 1');
      loaded = true;
    }
  } catch (err) {
    L.err(`❌ Failed to load turn state: ${err.message}`);
  }
}

/**
 * Start a new turn by incrementing and saving the counter.
 */
export async function startNewTurn() {
  currentTurn++;
  L.duel(`🔄 New turn started: Turn ${currentTurn}`);
  await persistTurn();
}

/**
 * Get the current turn number.
 * @returns {number} The current turn
 */
export function getCurrentTurn() {
  if (!loaded) L.duel('⚠️ getCurrentTurn called before initTurnState().');
  return currentTurn;
}

/**
 * Reset the turn counter back to 1 and persist.
 */
export async function resetTurn() {
  currentTurn = 1;
  L.duel('🔁 Turn reset to 1');
  await persistTurn();
}

/**
 * Internal helper to save turn state remotely.
 */
async function persistTurn() {
  try {
    await saveJSON(TURN_FILE, { currentTurn });
    L.storage(`💾 Saved turn state: Turn ${currentTurn}`);
  } catch (err) {
    L.err(`❌ Failed to persist turn state: ${err.message}`);
  }
}
