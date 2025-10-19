// utils/roleGuard.js
export const ROLE_IDS = {
  Recruit:        process.env.ROLE_RECRUIT_ID,
  Supporter:      process.env.ROLE_SUPPORTER_ID,
  EliteCollector: process.env.ROLE_ELITE_ID,
};

export function hasRole(member, roleIds = []) {
  if (process.env.DEBUG_MODE === "true") return true;
  return roleIds.some(id => id && member.roles.cache.has(id));
}

export function requireSupporter(member) {
  const ids = [ROLE_IDS.Supporter, ROLE_IDS.EliteCollector].filter(Boolean);
  return hasRole(member, ids);
}
