// utils/commandSync.js
// Robust command sync using REST so you SEE Discord's error body if one command is invalid.

import { REST, Routes } from 'discord.js';

function now() { return new Date().toISOString(); }

// Basic sanity checks to catch bad payloads before hitting Discord
function validateSlashData(slashData = []) {
  const errors = [];
  const names = new Set();
  for (const cmd of slashData) {
    const name = cmd?.name || cmd?.data?.name;
    if (!name) { errors.push('Command missing name'); continue; }
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) errors.push(`Invalid command name: "${name}"`);
    if (names.has(name)) errors.push(`Duplicate command name: "${name}"`);
    names.add(name);
  }
  return errors;
}

export async function syncCommands({ token, clientId, guildId, slashData, scope = 'guild' }) {
  if (!token) throw new Error('Missing DISCORD_TOKEN');
  if (!clientId) throw new Error('Missing CLIENT_ID (application id)');
  if (!Array.isArray(slashData) || !slashData.length) throw new Error('No slashData to deploy');

  const valErrs = validateSlashData(slashData);
  if (valErrs.length) {
    const msg = `SlashData validation failed:\n- ${valErrs.join('\n- ')}`;
    throw new Error(msg);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  const body = slashData.map(c => (c.data ? c.data : c)); // support either shape

  try {
    let route;
    if (scope === 'global') {
      route = Routes.applicationCommands(clientId);
    } else {
      if (!guildId) throw new Error('Missing GUILD_ID for guild scope');
      route = Routes.applicationGuildCommands(clientId, guildId);
    }

    const t0 = Date.now();
    const res = await rest.put(route, { body });
    const ms = Date.now() - t0;
    const count = Array.isArray(res) ? res.length : (res?.size ?? 0);

    return { ok: true, count, ms, scope };
  } catch (e) {
    // Surface the actual Discord API response if available
    const data = e?.rawError || e?.data || e?.response?.data || e;
    const friendly = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    const prefix = `[${now()}] commandSync error (${scope})`;
    console.error(prefix, friendly);
    return { ok: false, error: friendly };
  }
}
