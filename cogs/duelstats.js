// cogs/duelstats.js
// Launches the Stats/Leaderboard UI with a personalized (tokenized) link.
// - Must be used in Battlefield channel
// - Requires the user to be linked
// - Ensures the user has a token (mints + persists if missing)

import fs from 'fs';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

/* ───────────────────────────── Config helpers ───────────────────────────── */
function readOptionalConfig() {
  try {
    if (fs.existsSync('config.json')) {
      return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {};
    }
  } catch { /* noop */ }
  try {
    if (process.env.CONFIG_JSON) {
      return JSON.parse(process.env.CONFIG_JSON);
    }
  } catch { /* noop */ }
  return {};
}
const CFG = readOptionalConfig();

const trimBase = (u = '') => String(u).trim().replace(/\/+$/, '');
const pickBase = (...vals) => trimBase(vals.find(Boolean) || '');

function resolveLeaderboardBase(cfg = {}) {
  // Prefer your Stats-Leaderboard UI key, then other fallbacks
  return pickBase(
    process.env.STATS_LEADERBOARD_UI,
    cfg.stats_leaderboard_ui,
    cfg.ui_urls?.stats_leaderboard_ui,
    cfg.leaderboard_ui,                   // legacy key
    cfg.ui_urls?.leaderboard_ui,          // legacy key
    cfg.frontend_url,
    cfg.ui_base,
    'https://madv313.github.io/Stats-Leaderboard-UI'
  );
}
function resolveApiBase(cfg = {}) {
  return pickBase(
    process.env.API_BASE,
    cfg.api_base,
  );
}

const LEADERBOARD_BASE = resolveLeaderboardBase(CFG);
const API_BASE = resolveApiBase(CFG);
const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

const BATTLEFIELD_CHANNEL_ID = String(
  process.env.BATTLEFIELD_CHANNEL_ID ||
  CFG.battlefield_channel_id ||
  '1367986446232719484'
);

/* ───────────────────────────── Small utils ───────────────────────────── */
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}

/* ───────────────────────────── Command ───────────────────────────── */
export default async function registerDuelStats(client) {
  const data = new SlashCommandBuilder()
    .setName('duelstats')
    .setDescription('Open the SV13 Leaderboards (personalized link).')
    .setDMPermission(false);

  client.slashData.push(data.toJSON());

  client.commands.set('duelstats', {
    data,
    async execute(interaction) {
      // Channel guard
      if (String(interaction.channelId) !== BATTLEFIELD_CHANNEL_ID) {
        return interaction.reply({
          content: `🏆 Please use this command in <#${BATTLEFIELD_CHANNEL_ID}>.`,
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;

      // Load linked profiles
      let linked;
      try {
        linked = await loadJSON(PATHS.linkedDecks);
      } catch (e) {
        console.error('[duelstats] Failed to load linked_decks:', e?.message || e);
        return interaction.reply({
          content: '⚠️ Could not load your profile. Please try again later.',
          ephemeral: true,
        });
      }

      const profile = linked[userId];
      if (!profile) {
        return interaction.reply({
          content:
            '❌ You are not linked yet.\n' +
            'Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
          ephemeral: true,
        });
      }

      // Refresh display name; ensure token exists
      profile.discordName = username;
      if (!isTokenValid(profile.token)) {
        profile.token = randomToken(24);
        try {
          linked[userId] = profile;
          await saveJSON(PATHS.linkedDecks, linked);
        } catch (e) {
          console.warn('[duelstats] Failed to persist token mint:', e?.message || e);
        }
      }

      const token = profile.token;
      const ts = Date.now();
      const url = `${LEADERBOARD_BASE}/?token=${encodeURIComponent(token)}${apiQP}&ts=${ts}`;

      const embed = new EmbedBuilder()
        .setTitle('🏆 SV13 Leaderboards')
        .setDescription(
          [
            'Open the global **Leaderboards** to compare duel performance.',
            'Your link is tokenized so you can hop to other UIs without re-linking.',
          ].join('\n')
        )
        .setURL(url)
        .addFields(
          { name: 'Player', value: username, inline: true },
          { name: 'Link security', value: 'Tokenized per-player URL', inline: true },
        )
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open Leaderboards:** ${url}`,
        embeds: [embed],
        ephemeral: true,
      });
    },
  });
}
