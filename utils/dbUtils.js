// utils/dbUtils.js

import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('./data/database.json');

/**
 * Load the entire database from disk.
 * @returns {object|null} Parsed database object or null on failure
 */
export function getDatabase() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ [DB] Failed to read database.json:', err.message);
    return null;
  }
}

/**
 * Overwrite the database file with new data.
 * @param {object} data - The full object to store
 */
export function saveDatabase(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    console.log('✅ [DB] Database saved successfully');
  } catch (err) {
    console.error('❌ [DB] Failed to save database.json:', err.message);
  }
}
