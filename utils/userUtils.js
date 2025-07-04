// utils/userUtils.js

import fs from 'fs';
import path from 'path';

const userDataPath = path.resolve('./data/users.json');

/**
 * Fetch user data for a given user ID.
 * @param {string} userId - Discord user ID
 * @returns {object|null} The user data object or null if not found
 */
export function getUserData(userId) {
  try {
    const data = fs.readFileSync(userDataPath, 'utf-8');
    const users = JSON.parse(data);
    return users.find(user => user.id === userId) || null;
  } catch (err) {
    console.error('❌ Error fetching user data:', err.message);
    return null;
  }
}

/**
 * Update user data for a given user ID.
 * Merges fields if user exists, otherwise adds a new user entry.
 * @param {string} userId - Discord user ID
 * @param {object} update - Object containing fields to update
 */
export function updateUserData(userId, update) {
  try {
    let users = [];

    if (fs.existsSync(userDataPath)) {
      const data = fs.readFileSync(userDataPath, 'utf-8');
      users = JSON.parse(data);
    }

    const userIndex = users.findIndex(user => user.id === userId);

    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...update };
    } else {
      users.push({ id: userId, ...update });
    }

    fs.writeFileSync(userDataPath, JSON.stringify(users, null, 2));
    console.log(`✅ User data updated for ID: ${userId}`);
  } catch (err) {
    console.error('❌ Error updating user data:', err.message);
  }
}
