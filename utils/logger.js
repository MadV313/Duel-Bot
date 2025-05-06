// utils/logger.js

import fs from 'fs';
import path from 'path';

const logFile = path.resolve('./logs/activity.log');

// Helper function for logging messages
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage);
}

// Exported functions to log info, warnings, and errors
export function info(message) {
  log(message, 'INFO');
}

export function warn(message) {
  log(message, 'WARN');
}

export function error(message) {
  log(message, 'ERROR');
}
