// utils/rotateDuelLog.js
//
// Enhanced duel log rotation with optional persistent-data sync, retention cleanup,
// and unified logging integration. Fully compatible with your previous version.
//

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { L } from './logs.js';
import { save_file, load_file } from './storageClient.js'; // ✅ use persistent storage when available

const LOGS_DIR = path.resolve('./data/logs');
const CURRENT_LOG = path.join(LOGS_DIR, 'current_duel_log.json');
const RETENTION_DAYS = parseInt(process.env.DUEL_LOG_RETENTION_DAYS || '7', 10);

/**
 * Rotate and archive the current duel log file.
 * @returns {Promise<void>}
 */
export async function rotateDuelLog() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      L.duel('📁 Created duel logs directory.');
    }

    if (!fs.existsSync(CURRENT_LOG)) {
      L.duel('⚠️ No current duel log found; nothing to rotate.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `duel_log_${timestamp}.json`;
    const archivePath = path.join(LOGS_DIR, archiveName);

    // Move the current file
    await fsPromises.rename(CURRENT_LOG, archivePath);
    await fsPromises.writeFile(CURRENT_LOG, '[]', 'utf-8');
    L.duel(`✅ Duel log rotated → archived as ${archiveName}`);

    // 🔁 Optional: sync archived log to persistent storage
    try {
      if (process.env.PERSISTENT_DATA_URL) {
        const raw = await fsPromises.readFile(archivePath, 'utf-8');
        await save_file(`duel_logs/${archiveName}`, JSON.parse(raw));
        L.storage(`☁️ Archived ${archiveName} uploaded to persistent storage.`);
      }
    } catch (err) {
      L.err(`⚠️ Persistent upload failed for ${archiveName}: ${err.message}`);
    }

    // 🧹 Clean up old archives (older than RETENTION_DAYS)
    const files = await fsPromises.readdir(LOGS_DIR);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (file.startsWith('duel_log_') && file.endsWith('.json')) {
        const fullPath = path.join(LOGS_DIR, file);
        const stats = await fsPromises.stat(fullPath);
        if (stats.mtimeMs < cutoff) {
          await fsPromises.unlink(fullPath);
          L.duel(`🧹 Removed old duel log archive: ${file}`);
        }
      }
    }
  } catch (err) {
    L.err(`❌ Duel log rotation failed: ${err.message}`);
    L.err(err.stack);
  }
}
