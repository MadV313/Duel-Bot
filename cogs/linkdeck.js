// cogs/linkdeck.js
// /linkdeck — create or ensure a player profile, mint a per-user token, and return personal links

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

/**
 * Resolve a base URL for user-facing pages.
 * Priority:
 *  1) CONFIG.frontend_url
 *  2) CONFIG.ui_base (or UI_BASE)
 *  3) CONFIG.pack_reveal_ui (fallback)
 */
function resolveFrontendBase(config) {
  return (
    config.frontend_url ||
    config.ui_base ||
    config.UI_BASE ||
    config.pack_reveal_ui || // last-resort fallback
    ''
  ).replace(/\/+$/, ''); // trim trailing slashes
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
      const FRONTEND_BASE = resolveFrontendBase(CONFIG);

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

      // Build personal links (tokenized). If FRONTEND_BASE missing, we still show the token for manual use.
      const token = linked[userId].token;
      const hasBase = !!FRONTEND_BASE;

      const collectionUrl = hasBase ? `${FRONTEND_BASE}/me/${token}/collection` : null;
      const deckUrl       = hasBase ? `${FRONTEND_BASE}/me/${token}/deck`       : null;
      const statsUrl      = hasBase ? `${FRONTEND_BASE}/me/${token}/stats`      : null;

      let msgLines = [];
      if (created) {
        msgLines.push('✅ Your profile has been created and linked!');
      } else {
        msgLines.push('ℹ️ Your profile is already linked. Refreshed your details and ensured your personal links are active.');
      }

      if (hasBase) {
        msgLines.push(
          '',
          'Here are your personal links:',
          `• **Collection:** ${collectionUrl}`,
          `• **Deck Builder:** ${deckUrl}`,
          `• **Stats & Coins:** ${statsUrl}`
        );
      } else {
        msgLines.push(
          '',
          '⚠️ A frontend base URL is not configured. Ask an admin to set `frontend_url` (or `ui_base`) in `CONFIG_JSON` or `config.json`.',
          `Your token (save this): \`${token}\``,
          'Expected paths once configured:',
          '• /me/:token/collection',
          '• /me/:token/deck',
          '• /me/:token/stats'
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
