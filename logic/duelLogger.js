// logic/duelLogger.js

import fs from 'fs';
import path from 'path';

const logsDir = path.resolve('./data/logs');

// Ensure the directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const currentLogPath = path.join(logsDir, 'current_duel_log.json');

/**
 * Logs a duel event to the current duel log file.
 * @param {Object} entry - The event object to log.
 * Fields: { timestamp, action, player, detail }
 */
export function logDuelEvent(entry) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };

  let log = [];

  try {
    if (fs.existsSync(currentLogPath)) {
      const raw = fs.readFileSync(currentLogPath, 'utf-8');
      log = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read duel log:', err);
  }

  log.push(logEntry);

  try {
    fs.writeFileSync(currentLogPath, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('Failed to write duel log:', err);
  }
}

/**
 * Clears the current duel log (typically after duel ends).
 */
export function clearDuelLog() {
  try {
    fs.writeFileSync(currentLogPath, JSON.stringify([], null, 2));
    console.log('Duel log cleared.');
  } catch (err) {
    console.error('Failed to clear duel log:', err);
  }
}
