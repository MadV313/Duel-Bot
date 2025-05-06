// utils/dbUtils.js

import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('./data/database.json');

// Function to connect and interact with database (mocked as file in this case)
export function getDatabase() {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database:', err);
    return null;
  }
}

// Function to save data to the database
export function saveDatabase(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    console.log('✅ Database saved successfully');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}
