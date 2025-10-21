// cogs/mystats.js
// /mystats — Send the invoker to their personal Player Stats UI.
// - Restricted to #battlefield (configurable)
// - Requires linked profile (prompts to /linkdeck if missing)
// - Ensures/mints a per-user token and persists it
// - Builds URL with ?token=... (&api=... if configured) and cache-busting &ts=...

import fs from 'fs';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

const FALLBACK_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';

const trimBase = (u = '') => String(u).trim().replace(/\/+$/, '');
const isTokenValid = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
const randomToken = (len = 24) =>
  crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);

function loadConfig() {
  try {
    if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON);
  } catch (e) {
    console.warn(`[mystats] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    if (fs.existsSync('config.json')) {
      return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {};
    }
  } catch { /* ignore */ }
  return {};
}

// Belt & suspenders: if any config/env accidentally points to Stats-Leaderboard-UI,
// rewrite it to Player-Stats-UI so we never 404.
function normalizeStatsBase(u = '') {
  return String(u).replace(/\/Stats-Leaderboard-UI\/?/i, '/Player-Stats-UI/');
}

function resolveStatsBase(cfg) {
  // Prefer dedicated Player Stats UI; fall back to other UI bases
  const base = (
    cfg.player_stats_ui ||
    cfg.ui_urls?.player_stats_ui ||
    cfg.stats_leaderboard_ui ||            // legacy mis-key (normalize below)
    cfg.ui_urls?.stats_leaderboard_ui ||   // legacy mis-key (normalize below)
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    'https://madv313.github.io/Player-Stats-UI'
  );
  return trimBase(normalizeStatsBase(base));
}

export default async function registerMyStats(client) {
  const commandData = new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Open your personal Player Stats UI.')
    .setDMPermission(false);

  client.slashData.push(commandData.toJSON());

  client.commands.set('mystats', {
    data: commandData,
    async execute(interaction) {
      const CFG = loadConfig();

      const BATTLEFIELD_CHANNEL_ID = String(
        CFG.battlefield_channel_id ||
        CFG.battlefield ||
        CFG['battlefield-channel'] ||
        FALLBACK_BATTLEFIELD_CHANNEL_ID
      );

      // Channel guard
      if (String(interaction.channelId) !== BATTLEFIELD_CHANNEL_ID) {
        return interaction.reply({
          content: `📊 Please use this command in <#${BATTLEFIELD_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;

      // Load linked profiles from persistent store
      let linked = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }

      const profile = linked[userId];

      // Require linked first (do not auto-create here)
      if (!profile) {
        return interaction.reply({
          content:
            '❌ You don’t have a linked profile yet.\n' +
            'Please run **/linkdeck** in the **#manage-cards** channel first to use Duel Bot commands.',
          ephemeral: true
        });
      }

      // Keep display name fresh
      if (profile.discordName !== username) {
        profile.discordName = username;
      }

      // Ensure token (self-heal & persist)
      if (!isTokenValid(profile.token)) {
        profile.token = randomToken(24);
      }
      try {
        await saveJSON(PATHS.linkedDecks, { ...linked, [userId]: profile });
      } catch (e) {
        console.warn('[mystats] Failed to persist profile/token updates:', e?.message || e);
      }

      const STATS_BASE = resolveStatsBase(CFG);
      const API_BASE = trimBase(CFG.api_base || CFG.API_BASE || process.env.API_BASE || '');
      const ts = Date.now();

      const qp = new URLSearchParams();
      qp.set('token', profile.token);
      if (API_BASE) qp.set('api', API_BASE);
      qp.set('ts', String(ts));

      const statsUrl = `${STATS_BASE}/?${qp.toString()}`;

      const embed = new EmbedBuilder()
        .setTitle('📊 Your Player Stats')
        .setDescription(
          [
            'Open your personal Player Stats UI using the link below.',
            '',
            'From there you can:',
            '• Review duel history and record',
            '• Check coin balance and milestones',
            '• Jump to other UIs (Collection, Deck Builder, etc.)',
          ].join('\n')
        )
        .setURL(statsUrl)
        .addFields(
          { name: 'Player', value: `${username}`, inline: true },
          { name: 'Security', value: 'Tokenized per-player link', inline: true }
        )
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open your Player Stats:** ${statsUrl}`,
        embeds: [embed],
        ephemeral: true
      });
    }
  });
}
