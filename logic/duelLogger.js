// logic/duelLogger.js

// ⬇️ switched from local fs to remote storage client
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';

const currentLogPath = PATHS.duelLogCurrent;

/**
 * Logs a duel event to the current duel log.
 * @param {object} event - { at: ISO string, type: string, payload: any }
 */
export async function logDuelEvent(event) {
  const entry = {
    at: event?.at || new Date().toISOString(),
    type: event?.type || 'unknown',
    payload: event?.payload ?? null
  };

  let log = [];
  try {
    log = await loadJSON(currentLogPath);
    if (!Array.isArray(log)) log = [];
  } catch (err) {
    // If load fails, start a new log
    console.warn('⚠️ Failed to read current duel log, starting fresh:', err?.message);
    log = [];
  }

  log.push(entry);

  try {
    await saveJSON(currentLogPath, log);
    L.storage(`Appended duel log entry (${entry.type}).`);
  } catch (err) {
    console.error('❌ Failed to write to current duel log:', err);
    try {
      await adminAlert(globalThis.client || null, process.env.PAYOUTS_CHANNEL_ID, `logs/current_duel_log.json save failed: ${err.message}`);
    } catch {}
  }
}

/**
 * Clears the duel log file (used after duel ends).
 */
export async function clearDuelLog() {
  try {
    await saveJSON(currentLogPath, []);
    console.log('🧹 Duel log cleared.');
  } catch (err) {
    console.error('❌ Failed to clear duel log:', err);
    try {
      await adminAlert(globalThis.client || null, process.env.PAYOUTS_CHANNEL_ID, `logs/current_duel_log.json clear failed: ${err.message}`);
    } catch {}
  }
}
