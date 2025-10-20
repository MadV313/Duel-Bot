// utils/checkChannels.js
//
// Robust channel guard with env overrides + normalization.

function normList(val, fallback) {
  if (!val && !fallback) return [];
  const raw = (val ?? fallback ?? '')
    .toString()
    // allow commas OR whitespace separated lists
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
  // stringify & dedupe
  return [...new Set(raw.map(String))];
}

const allowedChannels = {
  manageCards: normList(process.env.CH_MANAGE_CARDS, '1367977677658656868'),
  battlefield: normList(process.env.CH_BATTLEFIELD,   '1367986446232719484'),
  adminTools:  normList(process.env.CH_ADMIN_TOOLS,   '1368023977519222895'),
};

export function isAllowedChannel(channelId, groups) {
  const cid = String(channelId).trim();
  if (!Array.isArray(groups) || groups.length === 0) {
    console.error('[checkChannels] ❌ Invalid "groups" input. Got:', groups);
    return false;
  }

  for (const group of groups) {
    const list = allowedChannels[group];
    if (!list) {
      console.warn(`[checkChannels] ⚠️ Unknown channel group "${group}". Known: ${Object.keys(allowedChannels).join(', ')}`);
      continue;
    }
    if (list.some(id => String(id).trim() === cid)) {
      return true;
    }
  }

  // Helpful diagnostics in logs
  console.warn(
    `[checkChannels] 🚫 Channel ${cid} not permitted for [${groups.join(', ')}]. ` +
    `Configured: ${groups.map(g => `${g}=[${(allowedChannels[g]||[]).join(',')}]`).join(' ')}`
  );
  return false;
}

export function listAllowedChannels() {
  return JSON.parse(JSON.stringify(allowedChannels));
}
