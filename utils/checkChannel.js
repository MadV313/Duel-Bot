// utils/checkChannels.js
//
// Enhanced: supports environment overrides & better diagnostics
// Keeps full compatibility with isAllowedChannel(channelId, groups)

const allowedChannels = {
  manageCards: process.env.CH_MANAGE_CARDS?.split(',') || ['1367977677658656868'],   // #manage-cards
  manageDeck: process.env.CH_MANAGE_DECK?.split(',') || ['1368023905964658760'],     // #manage-deck
  battlefield: process.env.CH_BATTLEFIELD?.split(',') || ['1367986446232719484'],    // #battlefield
  adminTools: process.env.CH_ADMIN_TOOLS?.split(',') || ['1368023977519222895']      // #admin-tools
};

/**
 * ✅ Check if a channel ID is allowed for the provided channel group(s).
 *
 * @param {string} channelId - The Discord channel ID to check.
 * @param {string[]} groups - Allowed group names (e.g., ['manageDeck']).
 * @returns {boolean} True if the channel is allowed for any group, false otherwise.
 */
export function isAllowedChannel(channelId, groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    console.error('[checkChannels] ❌ Invalid "groups" input (expected non-empty array).');
    return false;
  }

  let allowed = false;
  for (const group of groups) {
    const list = allowedChannels[group];
    if (!list) {
      console.warn(`[checkChannels] ⚠️ Unknown channel group: "${group}"`);
      continue;
    }

    if (list.includes(channelId)) {
      allowed = true;
      break;
    }
  }

  if (!allowed) {
    console.warn(`🚫 Channel ${channelId} is not permitted for groups [${groups.join(', ')}]`);
  }

  return allowed;
}

/**
 * 🔍 Returns a summary of all channel group IDs for debugging or admin tools.
 */
export function listAllowedChannels() {
  return JSON.parse(JSON.stringify(allowedChannels)); // safe copy
}
