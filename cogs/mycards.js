// cogs/mycards.js
// /mycards — Posts an EPHEMERAL embed with a tokenized link to the player’s personal Card Collection UI.
// Restrictions:
//  • Can only be used in channel ID 1367977677658656868 (#manage-cards)
//  • User must have linked a profile via /linkdeck (or they’ll be prompted to do so)

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const MANAGE_CARDS_CHANNEL_ID = '1367977677658656868';

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

function resolveCollectionBase(cfg) {
  // Prefer an explicit collection UI if present; otherwise use general frontend base
  const base = (cfg.collection_ui || cfg.frontend_url || cfg.ui_base || cfg.UI_BASE || 'https://madv313.github.io/Card-Collection-UI').trim();
  return base.replace(/\/+$/, '');
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
      const channelId = interaction.channelId;
      const userId = interaction.user.id;
      const userName = interaction.user.username;

      // Channel restriction
      if (String(channelId) !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: '⚠️ This command can only be used in <#1367977677658656868>.',
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

      // Ensure token exists (self-heal if older profile didn’t have one yet)
      if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
        linked[userId] = profile;
        try {
          await writeJson(linkedDecksPath, linked);
          console.log(`🔑 [mycards] Minted token for ${userName} (${userId})`);
        } catch (e) {
          console.warn('[mycards] Failed to persist token mint:', e);
          // continue; we’ll still attempt to reply with the in-memory token
        }
      }

      const CONFIG = loadConfig();
      const BASE = resolveCollectionBase(CONFIG);

      // If the base already points to an HTML page, append ?token=...
      // Otherwise, assume index.html under the base.
      const hasHtml = /\.(html?)$/i.test(BASE);
      const page = hasHtml ? BASE : `${BASE}/index.html`;

      // Optional: pass API base if configured (so the UI can call the same server)
      const apiBase = CONFIG.api_base || CONFIG.API_BASE || '';
      const url = apiBase
        ? `${page}?token=${encodeURIComponent(profile.token)}&api=${encodeURIComponent(apiBase)}`
        : `${page}?token=${encodeURIComponent(profile.token)}`;

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
