// utils/logger.js

import fs from 'fs';
import path from 'path';

const logDir = path.resolve('./logs');
const logFile = path.join(logDir, 'activity.log');

// Ensure the logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Internal helper to write a log message
 * @param {string} message - The message to log
 * @param {string} level - Log level (INFO, WARN, ERROR)
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logLine.trim());
  fs.appendFileSync(logFile, logLine);
}

/**
 * Log an info-level message
 * @param {string} message
 */
export function info(message) {
  log(message, 'INFO');
}

/**
 * Log a warning-level message
 * @param {string} message
 */
export function warn(message) {
  log(message, 'WARN');
}

/**
 * Log an error-level message
 * @param {string} message
 */
export function error(message) {
  log(message, 'ERROR');
}
