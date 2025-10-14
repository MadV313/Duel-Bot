// cogs/linkdeck.js
// /linkdeck — create or ensure a player profile, mint a per-user token,
// and reply with tokenized links to your static UIs (Card-Collection-UI, etc.)

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath    = path.resolve('./data/coin_bank.json');
const playerDataPath  = path.resolve('./data/player_data.json');

/* ---------------- config loader (ENV first, then config.json) ---------------- */
function _loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[linkdeck] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const cfg = JSON.parse(require('fs').readFileSync('config.json', 'utf-8'));
    return cfg || {};
  } catch {
    return {};
  }
}

/* ---------------- helpers ---------------- */
function randomToken(len = 24) {
  // URL-safe base64 without padding
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

function trimSlash(s = '') { return String(s).replace(/\/+$/, ''); }

/**
 * Build tokenized URLs for static UIs (GitHub Pages or elsewhere).
 * Uses top-level config first, then ui_urls map. Adds ?token=... and optional &api=...
 */
function buildUIUrls(cfg, token) {
  const ui = {
    collection: cfg.collection_ui || cfg.ui_urls?.card_collection_ui,
    deck:       cfg.deck_builder_ui || cfg.ui_urls?.deck_builder_ui,
    stats:      cfg.stats_leaderboard_ui || cfg.ui_urls?.stats_leaderboard_ui,
  };

  const API_BASE = cfg.api_base || cfg.API_BASE || ''; // your Railway backend url
  const qpApi = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

  const mk = (base) => base
    ? `${trimSlash(base)}/index.html?token=${encodeURIComponent(token)}${qpApi}`
    : null;

  return {
    collectionUrl: mk(ui.collection),
    deckUrl: mk(ui.deck),
    statsUrl: mk(ui.stats)
  };
}

/* ---------------- command registration ---------------- */
export default async function registerLinkDeck(client) {
  const commandData = new SlashCommandBuilder()
    .setName('linkdeck')
    .setDescription('Link your Discord ID to create your card collection profile and get your personal links.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('linkdeck', {
    data: commandData,
    async execute(interaction) {
      const userId   = interaction.user.id;
      const userName = interaction.user.username;
      const channelId = interaction.channelId;
      const guildId   = interaction.guildId;

      console.log(`📥 [linkdeck] Command from ${userName} (${userId}) in Guild ${guildId}, Channel ${channelId}`);

      if (!isAllowedChannel(channelId, ['manageCards'])) {
        console.warn(`⛔ [linkdeck] Denied: Channel ${channelId} is not allowed.`);
        return interaction.reply({
          content: '⚠️ This command can only be used in **#manage-cards**.',
          ephemeral: true
        });
      }

      const CONFIG = _loadConfig();

      // Load or init data files
      const linked = await readJson(linkedDecksPath, {});
      const bank   = await readJson(coinBankPath, {});
      const stats  = await readJson(playerDataPath, {});

      // Ensure profile record
      let created = false;
      if (!linked[userId]) {
        linked[userId] = {
          discordName: userName,
          deck: [],
          collection: {},
          createdAt: new Date().toISOString()
        };
        created = true;
        console.log(`🆕 [linkdeck] Created new profile for ${userName} (${userId})`);
      } else {
        // Keep display name fresh
        if (linked[userId].discordName !== userName) {
          linked[userId].discordName = userName;
        }
      }

      // Ensure a persistent per-user token for personal links
      if (!linked[userId].token || typeof linked[userId].token !== 'string' || linked[userId].token.length < 12) {
        linked[userId].token = randomToken(24);
        console.log(`🔑 [linkdeck] Minted token for ${userName} (${userId})`);
      }

      // Touch lastLinkedAt
      linked[userId].lastLinkedAt = new Date().toISOString();

      // Persist linked profile
      try {
        await writeJson(linkedDecksPath, linked);
      } catch (err) {
        console.error('❌ [linkdeck] Failed to save linked profile:', err);
        return interaction.reply({
          content: '❌ Failed to create or update your profile. Please try again later.',
          ephemeral: true
        });
      }

      // Ensure coin bank record
      if (typeof bank[userId] !== 'number') {
        bank[userId] = 0;
        try {
          await writeJson(coinBankPath, bank);
          console.log(`💰 [linkdeck] Initialized coin bank for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save coin_bank.json:', err);
        }
      }

      // Ensure stats record
      if (!stats[userId]) {
        stats[userId] = { wins: 0, losses: 0 };
        try {
          await writeJson(playerDataPath, stats);
          console.log(`📊 [linkdeck] Initialized player stats for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save player_data.json:', err);
        }
      }

      // Build personal links (tokenized) for static UIs (e.g., GitHub Pages)
      const token = linked[userId].token;
      const { collectionUrl, deckUrl, statsUrl } = buildUIUrls(CONFIG, token);

      let msgLines = [];
      if (created) {
        msgLines.push('✅ Your profile has been created and linked!');
      } else {
        msgLines.push('ℹ️ Your profile is already linked. Your personal links are below.');
      }

      if (collectionUrl || deckUrl || statsUrl) {
        msgLines.push('', 'Here are your personal links:');
        if (collectionUrl) msgLines.push(`• **Collection:** ${collectionUrl}`);
        if (deckUrl)       msgLines.push(`• **Deck Builder:** ${deckUrl}`);
        if (statsUrl)      msgLines.push(`• **Stats & Coins:** ${statsUrl}`);
      } else {
        msgLines.push(
          '',
          '⚠️ No UI base URLs are configured. Ask an admin to set these in `CONFIG_JSON` or `config.json`:',
          '```json\n{"collection_ui":"https://madv313.github.io/Card-Collection-UI/","pack_reveal_ui":"https://madv313.github.io/Pack-Reveal-UI/","api_base":"https://duel-bot-production.up.railway.app"}\n```',
          `Your token (save this): \`${token}\``
        );
      }

      msgLines.push('', 'Use **/buycard** to start collecting cards.');

      return interaction.reply({
        content: msgLines.join('\n'),
        ephemeral: true
      });
    }
  });
}
