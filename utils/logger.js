// utils/logger.js
//
// Enhanced file+console logger with rotation & safe async fallback.
// Keeps same public API (info, warn, error) but adds:
//  - async non-blocking writes
//  - daily rotation (activity-YYYY-MM-DD.log)
//  - graceful failover to console if fs errors
//  - ENV toggles: LOG_TO_FILE=false, LOG_DIR=/mnt/data/logs
//

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

const LOG_ENABLED = String(process.env.LOG_TO_FILE || 'true').toLowerCase() === 'true';
const LOG_DIR = path.resolve(process.env.LOG_DIR || './logs');

// --- helpers --------------------------------------------------------

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** return log file path with daily rotation */
function currentLogFile() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `activity-${date}.log`);
}

/** internal writer (async + safe) */
async function appendAsync(line) {
  if (!LOG_ENABLED) return;
  try {
    ensureDir();
    const file = currentLogFile();
    await fsPromises.appendFile(file, line, 'utf-8');
  } catch (err) {
    console.warn('⚠️ [Logger] Failed to write log file:', err.message);
  }
}

/** internal sync fallback for early init */
function appendSync(line) {
  try {
    ensureDir();
    fs.appendFileSync(currentLogFile(), line, 'utf-8');
  } catch (err) {
    console.warn('⚠️ [Logger] Sync write failed:', err.message);
  }
}

// --- core -----------------------------------------------------------

/**
 * Internal helper to log a message at given level.
 * @param {string} msg
 * @param {'INFO'|'WARN'|'ERROR'} level
 */
function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}\n`;

  // always print to console
  const fn =
    level === 'ERROR'
      ? console.error
      : level === 'WARN'
      ? console.warn
      : console.log;
  fn(line.trim());

  // async file write
  appendAsync(line).catch(() => appendSync(line));
}

// --- exports --------------------------------------------------------

export function info(message) {
  log(message, 'INFO');
}

export function warn(message) {
  log(message, 'WARN');
}

export function error(message) {
  log(message, 'ERROR');
}

/**
 * Optional helper to log structured data objects.
 * @param {string} title
 * @param {object} obj
 * @param {'DEBUG'|'DUMP'} [level='DEBUG']
 */
export function dump(title, obj, level = 'DEBUG') {
  const text = `${title} :: ${JSON.stringify(obj, null, 2)}`;
  log(text, level);
}
