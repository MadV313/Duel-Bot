
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
// cogs/linkdeck.js
// /linkdeck — create or ensure a player profile, mint a per-user token,
// and reply with tokenized links to your static UIs (Card-Collection-UI, etc.)
// Updates:
//  • Keeps all existing behavior
//  • Normalizes collection keys to 3-digit IDs
//  • Ensures/mints a persistent per-user token
//  • Builds tokenized links with optional &api= and &imgbase=
//  • Adds a cache-busting &ts=<epoch> to each link
//  • Refreshes stored discordName if it changed

import crypto from 'crypto';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('PATHS.linkedDecks');
const coinBankPath    = path.resolve('./data/coin_bank.json');
const playerDataPath  = path.resolve('PATHS.playerData');

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

function trimSlash(s = '') { return String(s).trim().replace(/\/+$/, ''); }
function pad3(n) { return String(n).padStart(3, '0'); }

/** Normalize collection keys to 3-digit strings (001, 002, ...). */
function normalizeCollectionMap(collection = {}) {
  const out = {};
  for (const [k, v] of Object.entries(collection)) {
    const id3 = pad3(k);
    const qty = Number(v) || 0;
    if (qty > 0) out[id3] = qty;
  }
  return out;
}

/**
 * Build tokenized URLs for static UIs (GitHub Pages or elsewhere).
 * Uses top-level config first, then ui_urls map. Adds ?token=... and optional &api=... and &imgbase=...
 * Appends &ts= for cache-busting.
 */
function buildUIUrls(cfg, token) {
  const ui = {
    collection: cfg.collection_ui || cfg.ui_urls?.card_collection_ui || 'https://madv313.github.io/Card-Collection-UI',
    deck:       cfg.deck_builder_ui || cfg.ui_urls?.deck_builder_ui || null,
    stats:      cfg.stats_leaderboard_ui || cfg.ui_urls?.stats_leaderboard_ui || null,
  };

  const API_BASE   = cfg.api_base || cfg.API_BASE || '';
  // Default image base to the front-end repo copy of images/cards; override via config if needed.
  const IMAGE_BASE = cfg.image_base || cfg.IMAGE_BASE || 'https://madv313.github.io/Card-Collection-UI/images/cards';
  const ts         = Date.now();

  const qpApi = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';
  const qpImg = IMAGE_BASE ? `&imgbase=${encodeURIComponent(trimSlash(IMAGE_BASE))}` : '';
  const qpTs  = `&ts=${ts}`;

  const mk = (base) => base
    ? `${trimSlash(base)}/index.html?token=${encodeURIComponent(token)}${qpApi}${qpImg}${qpTs}`
    : null;

  return {
    collectionUrl: mk(ui.collection),
    deckUrl:       mk(ui.deck),
    statsUrl:      mk(ui.stats)
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
      const userId    = interaction.user.id;
      const userName  = interaction.user.username;
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
      const linked = await await _loadJSONSafe(PATHS.linkedDecks);
      const bank   = await await _loadJSONSafe(PATHS.linkedDecks);
      const stats  = await await _loadJSONSafe(PATHS.linkedDecks);

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
        // Safety: normalize any existing collection keys to 3-digit IDs
        linked[userId].collection = normalizeCollectionMap(linked[userId].collection || {});
        // Safety: ensure deck is an array
        if (!Array.isArray(linked[userId].deck)) linked[userId].deck = [];
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
        await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
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
          await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
          console.log(`💰 [linkdeck] Initialized coin bank for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save coin_bank.json:', err);
        }
      }

      // Ensure stats record
      if (!stats[userId]) {
        stats[userId] = { wins: 0, losses: 0 };
        try {
          await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
          console.log(`📊 [linkdeck] Initialized player stats for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save player_data.json:', err);
        }
      }

      // Build personal links (tokenized) for static UIs (e.g., GitHub Pages)
      const token = linked[userId].token;
      const { collectionUrl, deckUrl, statsUrl } = buildUIUrls(CONFIG, token);

      const msgLines = [];
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
          '```json\n{"collection_ui":"https://madv313.github.io/Card-Collection-UI/","pack_reveal_ui":"https://madv313.github.io/Pack-Reveal-UI/","api_base":"https://duel-bot-production.up.railway.app","image_base":"https://madv313.github.io/Card-Collection-UI/images/cards"}\n```',
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
