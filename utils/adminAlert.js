// utils/adminAlert.js

/**
 * Send a concise admin alert to a tools channel.
 *
 * Usage:
 *   await adminAlert(client, '1368023977519222895', 'Failed to save wallet.json', {
 *     tag: 'STORAGE',                  // will prefix the message with [STORAGE]
 *     severity: 'error',               // 'info' | 'warn' | 'error' (default: 'warn')
 *     mentionRoleId: '1234567890123',  // optional: ping a specific role
 *     mentionEveryone: false,          // optional: ping @everyone (default false)
 *     meta: { file: 'wallet.json', userId, err: String(e) } // optional: extra context
 *   });
 *
 * Returns: true on success, false on failure.
 */
export async function adminAlert(
  client,
  channelId,
  message,
  {
    tag = 'ADMIN',
    severity = 'warn',
    mentionRoleId = null,
    mentionEveryone = false,
    meta = null,
  } = {}
) {
  const PREFIX = `[${String(tag || 'ADMIN').toUpperCase()}]`;
  const sev = String(severity).toLowerCase();
  const sevEmoji = sev === 'error' ? '🛑' : sev === 'info' ? 'ℹ️' : '⚠️';

  // Fallback to env channel if explicit id not provided or fails
  const fallbackChannelId = process.env.ADMIN_TOOLS_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID;

  const contentParts = [];

  // Optional mentions (be careful with spam)
  if (mentionEveryone) contentParts.push('@everyone');
  if (mentionRoleId) contentParts.push(`<@&${mentionRoleId}>`);

  // Main line
  contentParts.push(`${sevEmoji} ${PREFIX} ${message}`);

  // Optional metadata block (collapsed JSON)
  if (meta && typeof meta === 'object') {
    try {
      const json = JSON.stringify(meta, null, 2).slice(0, 1800); // keep under Discord limits
      contentParts.push('```json');
      contentParts.push(json);
      contentParts.push('```');
    } catch {
      // If meta can’t be stringified, send a plain fallback
      contentParts.push('```');
      contentParts.push(String(meta));
      contentParts.push('```');
    }
  }

  const content = contentParts.join('\n');

  try {
    // Attempt primary channel first
    let ch = null;
    if (channelId) {
      try {
        ch = await client.channels.fetch(String(channelId));
      } catch (e) {
        // will try fallback below
      }
    }
    // Fallback channel
    if (!ch && fallbackChannelId) {
      try {
        ch = await client.channels.fetch(String(fallbackChannelId));
      } catch {
        // swallow; we'll handle no channel below
      }
    }

    if (!ch || !ch.isTextBased?.()) {
      console.error(`${PREFIX} [ADMIN-ALERT] No valid text channel.`, {
        requestedChannelId: channelId,
        fallbackChannelId,
      });
      return false;
    }

    await ch.send({ content });
    return true;
  } catch (e) {
    console.error(`${PREFIX} [ADMIN-ALERT] send failed:`, e?.message || e);
    return false;
  }
}

/**
 * Convenience helper for storage failures with a consistent prefix & severity.
 */
export async function storageAlert(client, channelId, message, extra = {}) {
  return adminAlert(client, channelId, message, { tag: 'STORAGE', severity: 'error', ...extra });
}
