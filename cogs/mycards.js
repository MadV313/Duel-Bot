// cogs/mycards.js
// /mycards — Posts an EPHEMERAL embed with a tokenized link to the player’s personal Card Collection UI.
// Restrictions:
//  • Can only be used in #manage-cards (from config.manage_cards_channel_id or fallback to 1367977677658656868)
//  • User must have linked a profile via /linkdeck (or they’ll be prompted to do so)
// Updates:
//  • Keeps all existing behavior
//  • Self-heals: ensures token exists and normalizes stored name
//  • Builds link with ?token= plus optional &api=, &imgbase=, and cache-busting &ts=
//  • Uses config.collection_ui (or ui_urls.card_collection_ui/front end base) consistently

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// Fallback channel ID constant (used if not provided in config)
const FALLBACK_MANAGE_CARDS_CHANNEL_ID = '1367977677658656868';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

/* ---------------- config loader (ENV first, then config.json) ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[mycards] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}

function trimSlash(s = '') { return String(s).trim().replace(/\/+$/, ''); }

/** Prefer explicit Collection UI; fall back to general bases. */
function resolveCollectionBase(cfg) {
  const base =
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    'https://madv313.github.io/Card-Collection-UI';
  return trimSlash(String(base));
}

function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

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

export default async function registerMyCards(client) {
  const commandData = new SlashCommandBuilder()
    .setName('mycards')
    .setDescription('Get your personal tokenized link to view your card collection.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('mycards', {
    data: commandData,
    async execute(interaction) {
      const CONFIG = loadConfig();
      const MANAGE_CARDS_CHANNEL_ID =
        String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || FALLBACK_MANAGE_CARDS_CHANNEL_ID);

      const channelId = interaction.channelId;
      const userId = interaction.user.id;
      const userName = interaction.user.username;

      // Channel restriction
      if (String(channelId) !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: `⚠️ This command can only be used in <#${MANAGE_CARDS_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      // Load linked profiles
      const linked = await readJson(linkedDecksPath, {});
      const profile = linked[userId];

      if (!profile) {
        // Not linked yet
        return interaction.reply({
          content: '❌ You don’t have a linked profile yet. Use **/linkdeck** first to create your SV Duel Bot profile.',
          ephemeral: true
        });
      }

      // Keep display name fresh
      if (profile.discordName !== userName) {
        profile.discordName = userName;
      }

      // Ensure token exists (self-heal if older profile didn’t have one yet)
      if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
        console.log(`🔑 [mycards] Minted token for ${userName} (${userId})`);
      }

      // Persist any self-heal updates quietly
      try {
        linked[userId] = profile;
        await writeJson(linkedDecksPath, linked);
      } catch (e) {
        console.warn('[mycards] Failed to persist profile updates:', e?.message || e);
      }

      const BASE = resolveCollectionBase(CONFIG);

      // If the base already points to an HTML page, append ?token=...
      // Otherwise, assume index.html under the base.
      const hasHtml = /\.(html?)$/i.test(BASE);
      const page = hasHtml ? BASE : `${BASE}/index.html`;

      const apiBase   = CONFIG.api_base || CONFIG.API_BASE || '';
      const imageBase = CONFIG.image_base || CONFIG.IMAGE_BASE || 'https://madv313.github.io/Card-Collection-UI/images/cards';
      const ts        = Date.now();

      const qpToken = `token=${encodeURIComponent(profile.token)}`;
      const qpApi   = apiBase   ? `&api=${encodeURIComponent(apiBase)}` : '';
      const qpImg   = imageBase ? `&imgbase=${encodeURIComponent(trimSlash(imageBase))}` : '';
      const qpTs    = `&ts=${ts}`;

      const url = `${page}?${qpToken}${qpApi}${qpImg}${qpTs}`;

      const embed = new EmbedBuilder()
        .setTitle('🃏 Your Card Collection')
        .setDescription('This private link lets **you** view your collection only. Do not share it.')
        .setURL(url)
        .addFields(
          { name: 'Player', value: `${userName}`, inline: true },
          { name: 'Security', value: 'Tokenized link (per-player)', inline: true }
        )
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open your collection:** ${url}`,
        embeds: [embed],
        ephemeral: true // keep the token link private
      });
    }
  });
}
