// utils/commandSync.js
// Robust command sync using REST so you SEE Discord's error body if one command is invalid.
// Enhanced with retries, chunking, optional admin alert, and dry-run support.

import { REST, Routes } from 'discord.js';

// Optional admin alert (non-fatal if missing)
let adminAlertFn = null;
try {
  const mod = await import('./adminAlert.js');
  adminAlertFn = mod?.adminAlert || null;
} catch {
  // ignore: adminAlert is optional
}

function now() { return new Date().toISOString(); }
const TAG = '[COMMANDS]';

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

// Simple exponential backoff retry helper (for 429/5xx)
async function withRetries(fn, { attempts = 4, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e?.status || e?.rawError?.status || e?.response?.status;
      const isRate = code === 429 || e?.rawError?.retry_after;
      const is5xx = code >= 500 && code < 600;

      if (!(isRate || is5xx) || i === attempts - 1) break;

      const retryAfter =
        Number(e?.rawError?.retry_after || 0) * 1000 ||
        baseMs * Math.pow(2, i) + Math.floor(Math.random() * 200);

      console.warn(`${TAG} retry in ${retryAfter}ms (${i + 1}/${attempts}) due to ${code || 'error'}`);
      await new Promise(r => setTimeout(r, retryAfter));
    }
  }
  throw lastErr;
}

/**
 * Sync slash commands to Discord.
 * @param {Object} opts
 * @param {string} opts.token       - Discord bot token
 * @param {string} opts.clientId    - Application ID
 * @param {string} [opts.guildId]   - Guild ID (required when scope='guild')
 * @param {Array}  opts.slashData   - Array of command JSONs or objects with .data
 * @param {'guild'|'global'} [opts.scope='guild'] - Deployment scope
 * @returns {{ok: boolean, count?: number, ms?: number, scope?: string, error?: string}}
 */
export async function syncCommands({ token, clientId, guildId, slashData, scope = (process.env.COMMAND_SCOPE || 'guild') }) {
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

  const dryRun = String(process.env.COMMAND_SYNC_DRYRUN || 'false').toLowerCase() === 'true';
  const chunkSize = Number(process.env.COMMAND_SYNC_CHUNK || 0); // 0 => single PUT
  const useChunks = Number.isFinite(chunkSize) && chunkSize > 0;
  const targetScope = scope === 'global' ? 'global' : 'guild';

  try {
    let route;
    if (targetScope === 'global') {
      route = Routes.applicationCommands(clientId);
    } else {
      const gid = guildId || process.env.GUILD_ID;
      if (!gid) throw new Error('Missing GUILD_ID for guild scope');
      route = Routes.applicationGuildCommands(clientId, gid);
    }

    const t0 = Date.now();

    if (dryRun) {
      console.log(`${TAG} [DRYRUN] would PUT ${body.length} commands to ${targetScope} route.`);
      return { ok: true, count: body.length, ms: 0, scope: targetScope };
    }

    let res;
    if (!useChunks) {
      // Single PUT replaces the whole set
      res = await withRetries(() => rest.put(route, { body }));
    } else {
      // Chunked mode: PUT subsets in sequence to reduce payload pressure
      // NOTE: Discord PUT replaces the full command set. To approximate chunking safely,
      // we first clear (PUT []), then add in small batches.
      console.log(`${TAG} chunked deploy enabled (size=${chunkSize}). Clearing then uploading in batches...`);
      await withRetries(() => rest.put(route, { body: [] }));

      const chunks = [];
      for (let i = 0; i < body.length; i += chunkSize) {
        chunks.push(body.slice(i, i + chunkSize));
      }

      // Apply each chunk by merging: fetch current then append, PUT combined.
      // This minimizes race conditions but still respects "replace" semantics.
      for (let idx = 0; idx < chunks.length; idx++) {
        const existing = await withRetries(() => rest.get(route));
        const combined = [...existing, ...chunks[idx]];
        res = await withRetries(() => rest.put(route, { body: combined }));
        console.log(`${TAG} batch ${idx + 1}/${chunks.length} applied (running total: ${Array.isArray(res) ? res.length : 'n/a'})`);
      }
    }

    const ms = Date.now() - t0;
    const count = Array.isArray(res) ? res.length : (res?.size ?? body.length);

    console.log(`${TAG} deployed ${count} command(s) in ${ms}ms (${targetScope}).`);
    return { ok: true, count, ms, scope: targetScope };
  } catch (e) {
    // Surface the actual Discord API response if available
    const data = e?.rawError || e?.data || e?.response?.data || e;
    const friendly = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    const prefix = `[${now()}] ${TAG} commandSync error (${targetScope})`;
    console.error(prefix, friendly);

    // Optional admin alert
    const adminChannelId = process.env.ADMIN_TOOLS_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID;
    if (adminAlertFn && adminChannelId && process.env.COMMAND_SYNC_ALERTS !== 'false') {
      try {
        // We don't have a Discord client instance here; this util is commonly used at startup.
        // If you call syncCommands from a place where `client` is available, you can expose
        // an overload or send the alert externally. Here, we just log a helpful hint.
        console.warn(`${TAG} Admin alert is available but no Discord client in scope. Consider alerting from caller.`);
      } catch { /* noop */ }
    }

    return { ok: false, error: friendly };
  }
}
