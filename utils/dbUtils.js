// utils/dbUtils.js
//
// Backward-compatible local JSON DB helper with safe atomic writes and async variants.
//

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';

const dbPath = path.resolve(process.env.DB_PATH || './data/database.json');

/** ensure directory exists */
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Load the entire database from disk (sync).
 * @returns {object|null}
 */
export function getDatabase() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error('❌ [DB] Failed to read database.json:', err.message);
    return null;
  }
}

/**
 * Overwrite the database file with new data (sync, atomic).
 * @param {object} data
 */
export function saveDatabase(data) {
  try {
    ensureDir(dbPath);
    const tmp = path.join(os.tmpdir(), `database-${Date.now()}.json.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dbPath);
    console.log(`✅ [DB] Database saved (${dbPath})`);
  } catch (err) {
    console.error('❌ [DB] Failed to save database.json:', err.message);
  }
}

/**
 * Async version of getDatabase()
 * @returns {Promise<object|null>}
 */
export async function getDatabaseAsync() {
  try {
    const raw = await fsPromises.readFile(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ [DB] Failed to read database.json (async):', err.message);
    return null;
  }
}

/**
 * Async version of saveDatabase()
 * @param {object} data
 */
export async function saveDatabaseAsync(data) {
  try {
    ensureDir(dbPath);
    const tmp = path.join(os.tmpdir(), `database-${Date.now()}.json.tmp`);
    await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fsPromises.rename(tmp, dbPath);
    console.log(`✅ [DB] Database saved (async) → ${dbPath}`);
  } catch (err) {
    console.error('❌ [DB] Failed to save database.json (async):', err.message);
  }
}

/**
 * Quick utility to patch a single key.
 * Reads, mutates, saves.
 * @param {string} key
 * @param {*} value
 */
export async function updateKeyAsync(key, value) {
  const db = (await getDatabaseAsync()) || {};
  db[key] = value;
  await saveDatabaseAsync(db);
  return db;
}
