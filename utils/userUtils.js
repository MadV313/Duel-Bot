// utils/userUtils.js

import fs from 'fs';
import path from 'path';

const userDataPath = path.resolve('./data/users.json');

// Get user data from file
export function getUserData(userId) {
  try {
    const data = fs.readFileSync(userDataPath, 'utf-8');
    const users = JSON.parse(data);
    return users.find(user => user.id === userId) || null;
  } catch (err) {
    console.error('Error fetching user data:', err);
    return null;
  }
}

// Update user data in file
export function updateUserData(userId, update) {
  try {
    const data = fs.readFileSync(userDataPath, 'utf-8');
    const users = JSON.parse(data);
    const userIndex = users.findIndex(user => user.id === userId);

    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...update };
    } else {
      users.push({ id: userId, ...update });
    }

    fs.writeFileSync(userDataPath, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error updating user data:', err);
  }
}
