
async function _loadJSONSafe(name){
  try { return await loadJSON(name); }
  catch(e){ L.storage(`load fail ${name}: ${e.message}`); throw e; }
}
async function _saveJSONSafe(name, data, client){
  try { await saveJSON(name, data); }
  catch(e){ await adminAlert(client, process.env.PAYOUTS_CHANNEL_ID, `${name} save failed: ${e.message}`); throw e; }
}

import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
// cogs/mystats.js — Sends the invoker to their personal Player Stats UI.
// - Confined to #battlefield channel (warns if used elsewhere)
// - Requires the player to be linked first (warns to /linkdeck in #manage-cards)
// - Uses/mints the player's token from linked_decks.json (no extra field)
// - Passes the player's token (and optional &api=) in the URL
// - Replies with an ephemeral embed containing the personalized link
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   battlefield_channel_id
//   player_stats_ui / ui_urls.player_stats_ui / frontend_url / ui_base / UI_BASE
//   api_base / API_BASE
//
// Files used:
//   PATHS.linkedDecks

import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

/* ---------------- paths ---------------- */
const linkedDecksPath = path.resolve('PATHS.linkedDecks');

/* ---------------- config helpers ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[mystats] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
function resolveBaseUrl(s) {
  return (s || '').toString().trim().replace(/\/+$/, '');
}
function resolveStatsBase(cfg) {
  // Prefer dedicated Player Stats UI, then general UI bases as fallback
  return resolveBaseUrl(
    cfg.player_stats_ui ||
    cfg.ui_urls?.player_stats_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    ''
  );
}

/* ---------------- small utils ---------------- */
async function await _loadJSONSafe(PATHS.linkedDecks) {
  try {
    const raw = await loadJSON(PATHS.linkedDecks);
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function await _saveJSONSafe(PATHS.linkedDecks, \1, client) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await saveJSON(PATHS.linkedDecks));
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}

/* ---------------- command registration ---------------- */
export default async function registerMyStats(client) {
  const CONFIG = loadConfig();

  const BATTLEFIELD_CHANNEL_ID =
    String(CONFIG.battlefield_channel_id || CONFIG.battlefield || CONFIG['battlefield-channel'] || '1367986446232719484');

  const STATS_BASE = resolveStatsBase(CONFIG) || 'https://madv313.github.io/Player-Stats-UI';
  const API_BASE   = resolveBaseUrl(CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || '');

  const commandData = new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Open your personal Player Stats UI.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('mystats', {
    data: commandData,
    async execute(interaction) {
      // Channel guard
      if (interaction.channelId !== BATTLEFIELD_CHANNEL_ID) {
        return interaction.reply({
          content: `📊 Please use this command in the <#${BATTLEFIELD_CHANNEL_ID}> channel.`,
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;

      // Load profiles
      const linked = await await _loadJSONSafe(PATHS.linkedDecks);
      const profile = linked[userId];

      // Require linked first (do NOT auto-create; matches your requirement)
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

      // Ensure token exists (self-heal if missing)
      if (!isTokenValid(profile.token)) {
        profile.token = randomToken(24);
        try {
          linked[userId] = profile;
          await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
        } catch (e) {
          console.warn('[mystats] Failed to persist token mint:', e?.message || e);
        }
      }

      const token = profile.token;
      const ts = Date.now();
      const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

      // Personalized Player Stats URL
      const statsUrl = `${STATS_BASE}/?token=${encodeURIComponent(token)}${apiQP}&ts=${ts}`;

      const embed = new EmbedBuilder()
        .setTitle('📊 Your Player Stats')
        .setDescription(
          [
            'Open your personal Player Stats UI using the link below.',
            '',
            'From there you can:',
            '• Review duel history and record',
            '• Check coin balance, streaks, and milestones',
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
