// utils/rotateDuelLog.js

import fs from 'fs';
import path from 'path';

/**
 * Rotates the current duel log by archiving it with a timestamp and creating a fresh empty log.
 */
export function rotateDuelLog() {
  const logsDir = path.resolve('./data/logs');
  const currentLogPath = path.join(logsDir, 'current_duel_log.json');

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('📁 Created logs directory');
  }

  if (!fs.existsSync(currentLogPath)) {
    console.log('⚠️ No current duel log to rotate.');
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `duel_log_${timestamp}.json`;
    const archivePath = path.join(logsDir, archiveName);

    fs.renameSync(currentLogPath, archivePath);
    fs.writeFileSync(currentLogPath, '[]'); // Start fresh

    console.log(`✅ Duel log rotated and archived as: ${archiveName}`);
  } catch (err) {
    console.error('❌ Failed to rotate duel log:', err.message);
    console.error(err.stack);
  }
}
