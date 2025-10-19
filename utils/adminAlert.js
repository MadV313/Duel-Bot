// utils/adminAlert.js
export async function adminAlert(client, channelId, message) {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased()) {
      await ch.send(`⚠️ **Persistent write failed:** ${message}`);
    }
  } catch (e) {
    console.error("[ADMIN-ALERT] failed:", e.message);
  }
}
