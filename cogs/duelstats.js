// cogs/duelstats.js — Personal Duel Stats Viewer (public use)
// Updates:
//  • Mints/ensures a per-user token (saved to linked_decks.json) for deep-linked UIs
//  • Adds a tokenized "View Collection" link (Card-Collection-UI) with &api= passthrough
//  • Keeps existing channel gating, fields, and Player-Stats-UI link

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import crypto from 'crypto';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath    = path.resolve('./data/coin_bank.json');
const playerDataPath  = path.resolve('./data/player_data.json');

/* ---------------- Config helpers (ENV first, then config.json) ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[duelstats] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }
function resolveCollectionBase(cfg) {
  return trimBase(
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    'https://madv313.github.io/Card-Collection-UI'
  );
}
function resolveStatsBase(cfg) {
  // Your existing Player-Stats-UI host (kept as-is unless you later token-gate it)
  return trimBase(cfg.stats_ui || 'https://madv313.github.io/Player-Stats-UI');
}
function resolveApiBase(cfg) {
  return trimBase(cfg.api_base || cfg.API_BASE || process.env.API_BASE || '');
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

/* ---------------- Allowed channels (unchanged) ---------------- */
const ALLOWED_CHANNELS = [
  '1367977677658656868', // #manage-cards
  '1367986446232719484', // #battlefield
  '1368023977519222895'  // #admin-tools
];

export default async function registerDuelStats(client) {
  const CFG              = loadConfig();
  const COLLECTION_BASE  = resolveCollectionBase(CFG);
  const STATS_BASE       = resolveStatsBase(CFG);
  const API_BASE         = resolveApiBase(CFG);
  const apiQP            = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

  const commandData = new SlashCommandBuilder()
    .setName('duelstats')
    .setDescription('View your own SV13 TCG duel statistics and profile.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('duelstats', {
    data: commandData,
    async execute(interaction) {
      const userId   = interaction.user.id;
      const userTag  = interaction.user.tag;
      const channelId = interaction.channelId;
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] 📊 /duelstats triggered by ${userTag} (${userId}) in ${channelId}`);

      if (!ALLOWED_CHANNELS.includes(channelId)) {
        console.warn(`[${timestamp}] ❌ /duelstats used in wrong channel by ${userTag}`);
        return interaction.reply({
          content: '❌ This command must be used in an SV13 TCG channel: #manage-cards, #battlefield, or #admin-tools.',
          ephemeral: true
        });
      }

      // Load profile; ensure linked & tokenized
      let linkedData = {};
      try {
        linkedData = JSON.parse(await fs.readFile(linkedDecksPath, 'utf-8'));
      } catch {
        return interaction.reply({
          content: '⚠️ Unable to load your profile. Make sure you’ve used `/linkdeck` in #manage-cards.',
          ephemeral: true
        });
      }

      let profile = linkedData[userId];
      if (!profile || !profile.collection || !profile.deck) {
        return interaction.reply({
          content: '⚠️ You are not linked yet. Please run `/linkdeck` in the #manage-cards channel to get started.',
          ephemeral: true
        });
      }

      // Ensure token (mint once, persist)
      if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
        linkedData[userId] = profile;
        try {
          await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));
          console.log(`[${timestamp}] 🔐 Minted token for ${userTag} (${userId})`);
        } catch (e) {
          console.warn(`[${timestamp}] ⚠️ Failed to persist token for ${userId}: ${e?.message}`);
        }
      }

      // Coins / W-L
      let coin = 0, wins = 0, losses = 0;
      try {
        const coinData = JSON.parse(await fs.readFile(coinBankPath, 'utf-8'));
        coin = coinData[userId] ?? 0;
      } catch {}
      try {
        const statsData = JSON.parse(await fs.readFile(playerDataPath, 'utf-8'));
        if (statsData[userId]) {
          wins   = statsData[userId].wins   ?? 0;
          losses = statsData[userId].losses ?? 0;
        }
      } catch {}

      // Collection summary
      const ownedIds = Object.keys(profile.collection || {});
      const uniqueUnlocked = ownedIds.filter(id => {
        const n = parseInt(id, 10);
        return n >= 1 && n <= 127;
      }).length;

      // Deep links
      const ts = Date.now();
      const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}&ts=${ts}`;
      // Keeping your existing Player-Stats-UI link (ID-based). If you later tokenize it, swap to token similarly.
      const statsUrl = `${STATS_BASE}/?id=${encodeURIComponent(userId)}`;

      const embed = new EmbedBuilder()
        .setTitle(`<:ID:1391239596112613376> Your SV13 Duel Stats`)
        .addFields(
          { name: '🂠 Deck Size', value: `${profile.deck.length}`, inline: true },
          { name: '🀢🀣🀦🀤 Collection Size', value: `${Object.values(profile.collection).reduce((a, b) => a + b, 0)}`, inline: true },
          { name: '🀢ᯓ★ Cards Unlocked', value: `${uniqueUnlocked} / 127`, inline: true },
          { name: '⛃ Coins', value: `${coin}`, inline: true },
          { name: '╰── ──╮ Wins / Losses', value: `${wins} / ${losses}`, inline: true }
        )
        .addFields(
          { name: '🗂️ View Cards', value: `[Open your Collection UI](${collectionUrl})`, inline: false },
          { name: '🌐 View Full Stats Online', value: `[Open your Player Stats UI](${statsUrl})`, inline: false }
        )
        .setFooter({ text: `Linked to: ${interaction.user.username}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  });
}
