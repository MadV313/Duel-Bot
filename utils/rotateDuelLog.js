import fs from 'fs';
import path from 'path';

export function rotateDuelLog() {
  const logsDir = path.resolve('./data/logs');
  const currentLogPath = path.join(logsDir, 'current_duel_log.json');

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true }); // Create the logs directory if it doesn't exist
  }

  // If no current log exists, we return early
  if (!fs.existsSync(currentLogPath)) {
    console.log('No current duel log to rotate.');
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `duel_log_${timestamp}.json`;
    const archivePath = path.join(logsDir, archiveName);

    // Rename (rotate) the old log
    fs.renameSync(currentLogPath, archivePath);

    // Start a new empty log
    fs.writeFileSync(currentLogPath, '[]');
    console.log(`✅ Duel log rotated: ${archiveName}`);
  } catch (err) {
    console.error('❌ Failed to rotate duel log:', err.message);
    console.error(err.stack); // More detailed error trace for debugging
  }
}
