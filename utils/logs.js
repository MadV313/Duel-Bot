// utils/logs.js
//
// Lightweight namespaced logger with timestamps, colors, and optional file mirror.
// Keeps same API: L.duel(), L.trade(), L.storage(), L.role(), L.econ(), L.err()

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

const ENABLE_FILE_LOG = String(process.env.LOG_TO_FILE || 'false').toLowerCase() === 'true';
const LOG_DIR = path.resolve(process.env.LOG_DIR || './logs');

// --- helper: timestamp + colors --------------------------------------------------

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function colorize(label, color) {
  return `${COLORS[color] || ''}${label}${COLORS.reset}`;
}

async function writeFileLine(label, msg) {
  if (!ENABLE_FILE_LOG) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${label.toLowerCase()}.log`);
    await fsPromises.appendFile(file, `[${ts()}] ${msg}\n`);
  } catch (err) {
    console.warn(`⚠️ [LOGS] Failed to write ${label} log:`, err.message);
  }
}

// --- generic factory -------------------------------------------------------------

function makeLogger(prefix, color = 'gray', isError = false) {
  return async (...args) => {
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
    const tag = colorize(`[${prefix}]`, color);
    const line = `${COLORS.gray}[${ts()}]${COLORS.reset} ${tag} ${message}`;

    if (isError) console.error(line);
    else console.log(line);

    await writeFileLine(prefix, message);
  };
}

// --- exported instance -----------------------------------------------------------

export const L = {
  duel:    makeLogger('DUEL', 'cyan'),
  trade:   makeLogger('TRADE', 'yellow'),
  storage: makeLogger('STORAGE', 'magenta'),
  role:    makeLogger('ROLE', 'green'),
  econ:    makeLogger('ECONOMY', 'yellow'),
  err:     makeLogger('ERROR', 'red', true),
};
