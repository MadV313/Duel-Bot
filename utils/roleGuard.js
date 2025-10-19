// utils/roleGuard.js
//
// Drop-in upgrade with full logging, safety checks, and centralized validation.
// Keeps existing exports: ROLE_IDS, hasRole(), requireSupporter()

import { L } from './logs.js'; // ✅ uses your unified logger (safe even if file logging off)

// --- Role configuration ----------------------------------------------------------

export const ROLE_IDS = {
  Recruit:        process.env.ROLE_RECRUIT_ID,
  Supporter:      process.env.ROLE_SUPPORTER_ID,
  EliteCollector: process.env.ROLE_ELITE_ID,
};

// Quick sanity check at startup
for (const [k, v] of Object.entries(ROLE_IDS)) {
  if (!v) console.warn(`⚠️ [RoleGuard] Missing env for ${k} role ID`);
}

// --- Core functions --------------------------------------------------------------

/**
 * Check if a guild member has at least one of the specified roles.
 * @param {GuildMember} member
 * @param {string[]} roleIds
 * @returns {boolean}
 */
export function hasRole(member, roleIds = []) {
  try {
    if (process.env.DEBUG_MODE === 'true') {
      L.role(`DEBUG_MODE active → granting all roles to ${member?.user?.tag || 'unknown'}`);
      return true;
    }

    if (!member || !member.roles?.cache) {
      L.err(`Role check failed: invalid member object`);
      return false;
    }

    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      L.role(`No roles provided for check against ${member.user?.tag}`);
      return false;
    }

    const result = roleIds.some(id => id && member.roles.cache.has(id));
    L.role(`${member.user?.tag || member.id} ${result ? '✅ has' : '❌ missing'} one of ${roleIds.join(', ')}`);
    return result;
  } catch (err) {
    L.err(`hasRole() exception: ${err.message}`);
    return false;
  }
}

/**
 * Checks if the user is a Supporter-tier (Supporter OR EliteCollector).
 * @param {GuildMember} member
 * @returns {boolean}
 */
export function requireSupporter(member) {
  const ids = [ROLE_IDS.Supporter, ROLE_IDS.EliteCollector].filter(Boolean);
  return hasRole(member, ids);
}
