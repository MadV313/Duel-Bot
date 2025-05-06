import fs from 'fs';
import path from 'path';

export function rotateDuelLog() {
  const logsDir = path.resolve('./data/logs');
  const currentLogPath = path.join(logsDir, 'current_duel_log.json');

  if (!fs.existsSync(currentLogPath)) {
    return; // No log yet to rotate
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
    console.error('❌ Failed to rotate duel log:', err);
  }
}
