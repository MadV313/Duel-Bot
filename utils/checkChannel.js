const allowedChannels = {
  manageCards: ['1367977677658656868'],   // #manage-cards
  manageDeck: ['1368023905964658760'],    // #manage-deck
  battlefield: ['1367986446232719484'],   // #battlefield
  adminTools: ['1368023977519222895']     // #admin-tools
};

/**
 * Check if the interaction is in an allowed channel group
 * @param {string} channelId - Discord channel ID
 * @param {string[]} groups - Names like ['manageCards', 'battlefield']
 * @returns {boolean}
 */
export function isAllowedChannel(channelId, groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    console.error("Invalid groups input. Expected a non-empty array.");
    return false;
  }

  for (const group of groups) {
    if (!allowedChannels.hasOwnProperty(group)) {
      console.error(`Invalid group name: ${group}`);
      continue; // Skip invalid group names
    }

    const allowed = allowedChannels[group];
    if (allowed?.includes(channelId)) return true;
  }
  return false;
}
