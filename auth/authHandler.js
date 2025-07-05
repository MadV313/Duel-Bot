// authHandler.js

import { isValidDiscordId } from './utils.js';
import { config } from './utils/config.js'; // ✅ Updated config import

/**
 * Check if the user has the required admin permissions
 * @param {string} userId - Discord ID of the user
 * @returns {boolean} - True if the user is an admin
 */
export function isAdmin(userId) {
  return config.adminIds.includes(userId);
}

/**
 * Verifies if the player is eligible to join a duel
 * @param {string} userId - Discord ID of the user
 * @returns {boolean} - True if the player is eligible
 */
export function isEligibleForDuel(userId) {
  // Logic to verify if the user is eligible (could be checking if they're in the right role, etc.)
  return isValidDiscordId(userId);
}
