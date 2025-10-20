// utils/checkChannels.js
const splitIds = (s) => (s ? s.split(',').map(x => String(x).trim()).filter(Boolean) : []);

const allowedChannels = {
  manageCards: splitIds(process.env.MANAGE_CARDS_CHANNEL_ID) || ['1367977677658656868'],
  battlefield: splitIds(process.env.BATTLEFIELD_CHANNEL_ID)  || ['1367986446232719484'],
  adminTools : splitIds(process.env.ADMIN_TOOLS_CHANNEL_ID)  || ['1368023977519222895'],
};

export function isAllowedChannel(channelId, groups) {
  const id = String(channelId);
  const listOfGroups = Array.isArray(groups) ? groups : [groups];

  if (!listOfGroups.length) {
    console.error('[checkChannels] ❌ Invalid "groups" input (expected non-empty array or string).');
    return false;
  }

  for (const group of listOfGroups) {
    const list = allowedChannels[group];
    if (!list) {
      console.warn(`[checkChannels] ⚠️ Unknown channel group: "${group}"`);
      continue;
    }
    if (list.includes(id)) return true;
  }

  console.warn(`🚫 Channel ${id} is not permitted for groups [${listOfGroups.join(', ')}]`);
  return false;
}

export function listAllowedChannels() {
  return JSON.parse(JSON.stringify(allowedChannels));
}
