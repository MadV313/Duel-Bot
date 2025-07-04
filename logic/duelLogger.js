// logic/duelLogger.js

import fs from 'fs';
import path from 'path';

const logsDir = path.resolve('./data/logs');
const currentLogPath = path.join(logsDir, 'current_duel_log.json');

// 🧱 Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('🗂️ Created logs directory:', logsDir);
}

/**
 * Logs a duel event to the current duel log.
 * @param {Object} entry - Event details (action, player, detail)
 * Example: { action: 'play_card', player: 'player1', detail: '045' }
 */
export function logDuelEvent(entry) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, ...entry };

  let log = [];

  try {
    if (fs.existsSync(currentLogPath)) {
      const raw = fs.readFileSync(currentLogPath, 'utf-8');
      log = JSON.parse(raw);
    }
  } catch (err) {
    console.error('❌ Failed to read duel log:', err);
  }

  log.push(logEntry);

  try {
    fs.writeFileSync(currentLogPath, JSON.stringify(log, null, 2));
    console.log(`📝 Logged event: ${entry.action} — ${entry.detail || 'no detail'} by ${entry.player}`);
  } catch (err) {
    console.error('❌ Failed to write duel log:', err);
  }
}

/**
 * Clears the duel log file (used after duel ends).
 */
export function clearDuelLog() {
  try {
    fs.writeFileSync(currentLogPath, JSON.stringify([], null, 2));
    console.log('🧹 Duel log cleared.');
  } catch (err) {
    console.error('❌ Failed to clear duel log:', err);
  }
}
