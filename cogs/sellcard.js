// cogs/sellcard.js — Gives the invoker their personal Card Collection UI link for selling.
// - Confined to #manage-cards channel
// - Warns if the player is not yet linked (asks to run /linkdeck first)
// - Auto-uses/mints the player's token from linked_decks.json
// - If the player has already sold 5 cards in the last 24h, returns a warning embed
//   with a countdown until they can sell again (no link shown in that case)
// - Otherwise, sends an embed with the Collection URL + selling instructions (limit 5/day)
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   manage_cards_channel_id
//   collection_ui / ui_urls.card_collection_ui / frontend_url / ui_base / UI_BASE
//   api_base / API_BASE
//
// Files used:
//   ./data/linked_decks.json
//
// Notes:
// - This command only *warns* about the daily sell limit based on profile.sellStats.
//   Your Collection UI/back-end should still enforce the limit during actual sale.
// - We track a simple rolling 24h window via sellStats: { windowStartISO, sellsInWindow }.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

/* ---------------- paths ---------------- */
const linkedDecksPath = path.resolve('./data/linked_decks.json');

/* ---------------- config helpers ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[sellcard] CONFIG_JSON parse error: ${e?.message}`);
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

function resolveCollectionBase(cfg) {
  return resolveBaseUrl(
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    ''
  );
}

/* ---------------- small utils ---------------- */
async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}
function fmtHMS(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ---------------- constants ---------------- */
const DAILY_SELL_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/* ---------------- command registration ---------------- */
export default async function registerSellCard(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  const COLLECTION_BASE = resolveCollectionBase(CONFIG) || 'https://madv313.github.io/Card-Collection-UI';
  const API_BASE = resolveBaseUrl(CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || '');

  const commandData = new SlashCommandBuilder()
    .setName('sellcard')
    .setDescription('Get your personal collection link to sell cards (limit 5/day).');

  client.slashData.push(commandData.toJSON());

  client.commands.set('sellcard', {
    data: commandData,
    async execute(interaction) {
      // Channel guard
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: '🧾 Please use this command in the **#manage-cards** channel.',
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;

      // Load profile; warn if not linked (do NOT auto-create here)
      const linked = await readJson(linkedDecksPath, {});
      const profile = linked[userId];

      if (!profile) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ Player Not Linked')
          .setDescription(
            [
              'You are not yet linked to the Duel Bot system.',
              '',
              'Please run **`/linkdeck`** in the **#manage-cards** channel before using Duel Bot commands.',
              '',
              'Once linked, you’ll be able to browse your collection, sell cards, and participate in duels.'
            ].join('\n')
          )
          .setColor(0xff9900);
        return interaction.reply({ embeds: [warn], ephemeral: true });
      }

      // Keep Discord name fresh
      if (profile.discordName !== username) {
        profile.discordName = username;
      }

      // Ensure token (no user input)
      if (!isTokenValid(profile.token)) {
        profile.token = randomToken(24);
      }

      // Check daily sell limit window (advisory only; UI/back-end must enforce)
      const now = Date.now();
      const stats = profile.sellStats || {};
      let windowStart = stats.windowStartISO ? Date.parse(stats.windowStartISO) : 0;
      let sellsInWindow = Number.isFinite(stats.sellsInWindow) ? Number(stats.sellsInWindow) : 0;

      // If window missing/stale, reset it
      if (!windowStart || (now - windowStart) >= WINDOW_MS) {
        windowStart = now;
        sellsInWindow = 0;
        profile.sellStats = { windowStartISO: new Date(windowStart).toISOString(), sellsInWindow };
        linked[userId] = profile;
        await writeJson(linkedDecksPath, linked);
      }

      // If limit already hit, return warning embed with countdown (no link)
      if (sellsInWindow >= DAILY_SELL_LIMIT) {
        const waitMs = WINDOW_MS - (now - windowStart);
        const warn = new EmbedBuilder()
          .setTitle('⏳ Daily Sell Limit Reached')
          .setDescription(
            [
              `You’ve already sold **${DAILY_SELL_LIMIT} cards** in the last 24 hours.`,
              `Please come back in **${fmtHMS(waitMs)}** to continue selling.`,
              '',
              '_Tip: You can still browse your collection using the `/mycards` command; further sales are blocked until the timer resets._'
            ].join('\n')
          )
          .setColor(0xff9900);

        return interaction.reply({
          embeds: [warn],
          ephemeral: true
        });
      }

      // Otherwise, return Collection link + selling instructions
      linked[userId] = profile;
      await writeJson(linkedDecksPath, linked);

      const token = profile.token;
      const ts = Date.now();
      const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

      // Personal Collection URL (used for selling within the UI)
      const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(token)}${apiQP}&ts=${ts}`;

      const embed = new EmbedBuilder()
        .setTitle('🧾 Sell Your Cards')
        .setDescription(
          [
            'Use your personal collection link below. From there you can sell eligible cards.',
            '',
            '**Selling instructions:**',
            '• When selling, make sure you **select the proper amount of each card** before adding it to the queue.',
            '• Once satisfied with your selection, **confirm the sale in the sale queue at the bottom** of the page.',
            '• **Only 5 cards allowed to be sold per day.**'
          ].join('\n')
        )
        .setURL(collectionUrl)
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open your personal Collection:** ${collectionUrl}`,
        embeds: [embed],
        ephemeral: true
      });
    }
  });
}
