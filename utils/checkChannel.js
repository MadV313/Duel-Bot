// utils/checkChannels.js

// Channel group definitions (Discord channel IDs)
const allowedChannels = {
  manageCards: ['1367977677658656868'],   // #manage-cards
  manageDeck: ['1368023905964658760'],    // #manage-deck
  battlefield: ['1367986446232719484'],   // #battlefield
  adminTools: ['1368023977519222895']     // #admin-tools
};

/**
 * Check if a channel ID is allowed for the provided channel group(s).
 * 
 * @param {string} channelId - The Discord channel ID to check.
 * @param {string[]} groups - An array of allowed group names (e.g. ['manageDeck']).
 * @returns {boolean} - True if the channel is allowed for any group, false otherwise.
 */
export function isAllowedChannel(channelId, groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    console.error('[checkChannels] ❌ Invalid "groups" input. Expected a non-empty array.');
    return false;
  }

  for (const group of groups) {
    if (!Object.prototype.hasOwnProperty.call(allowedChannels, group)) {
      console.warn(`[checkChannels] ⚠️ Unknown group: "${group}"`);
      continue;
    }

    if (allowedChannels[group].includes(channelId)) {
      return true;
    }
  }

  return false;
}
