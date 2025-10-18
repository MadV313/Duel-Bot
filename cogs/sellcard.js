// cogs/sellcard.js — Gives the invoker their personal Card Collection UI link for selling.
// - Confined to #manage-cards channel
// - Auto-uses/mints the player's token from linked_decks.json
// - Sends an embed with the Collection URL + selling instructions (limit 5/day)
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   manage_cards_channel_id
//   collection_ui / ui_urls.card_collection_ui / frontend_url / ui_base / UI_BASE
//   api_base / API_BASE
//
// Files used:
//   ./data/linked_decks.json

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

      // Ensure profile + token
      const linked = await readJson(linkedDecksPath, {});
      if (!linked[userId]) {
        linked[userId] = {
          discordName: username,
          coins: 0,
          deck: [],
          collection: {},
          createdAt: new Date().toISOString()
        };
      } else if (linked[userId].discordName !== username) {
        linked[userId].discordName = username;
      }
      if (!linked[userId].token || typeof linked[userId].token !== 'string' || linked[userId].token.length < 12) {
        linked[userId].token = randomToken(24);
      }

      await writeJson(linkedDecksPath, linked);

      const token = linked[userId].token;
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
