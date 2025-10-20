// cogs/linkdeck.js
// /linkdeck — create or ensure a player profile, mint a per-user token,
// and reply with tokenized links to your static UIs (Collection, Deck Builder, Stats).
// - Confined to #manage-cards (via utils/checkChannels.js)
// - Normalizes collection keys to 3-digit IDs (001, 002, ...)
// - Ensures & persists a per-user token
// - Adds &api=, &imgbase= (if configured) and &ts= cache-buster to links
// - ✅ If the account is already linked (token present), warns instead of “created” copy

import fs from 'fs';
import crypto from 'crypto';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannels.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

/* ───────────────────────── Helpers & config ───────────────────────── */

const pad3 = n => String(n).padStart(3, '0');

function normalizeCollectionMap(collection = {}) {
  const out = {};
  for (const [k, v] of Object.entries(collection)) {
    const id3 = pad3(k);
    const qty = Number(v) || 0;
    if (qty > 0) out[id3] = qty;
  }
  return out;
}

function randomToken(len = 24) {
  // URL-safe base64 without padding
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }

function loadConfig() {
  // ENV first
  try {
    if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON);
  } catch (e) {
    console.warn(`[linkdeck] CONFIG_JSON parse error: ${e?.message}`);
  }
  // config.json fallback
  try {
    if (fs.existsSync('config.json')) {
      return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {};
    }
  } catch { /* ignore */ }
  return {};
}

/**
 * Build tokenized URLs for static UIs.
 * Uses top-level keys first, then ui_urls map.
 * Adds ?token=..., optional &api=..., &imgbase=..., and &ts=...
 */
function buildUIUrls(cfg, token) {
  const collectionBase = cfg.collection_ui
    || cfg.ui_urls?.card_collection_ui
    || 'https://madv313.github.io/Card-Collection-UI';

  const deckBase = cfg.deck_builder_ui
    || cfg.ui_urls?.deck_builder_ui
    || null;

  const statsBase = cfg.stats_leaderboard_ui
    || cfg.ui_urls?.stats_leaderboard_ui
    || null;

  const API_BASE   = trimBase(cfg.api_base || cfg.API_BASE || process.env.API_BASE || '');
  const IMAGE_BASE = trimBase(cfg.image_base || cfg.IMAGE_BASE || 'https://madv313.github.io/Card-Collection-UI/images/cards');
  const ts         = Date.now();

  const qp = new URLSearchParams();
  qp.set('token', token);
  if (API_BASE)   qp.set('api', API_BASE);
  if (IMAGE_BASE) qp.set('imgbase', IMAGE_BASE);
  qp.set('ts', String(ts));

  const mk = (base) => base ? `${trimBase(base)}/index.html?${qp.toString()}` : null;

  return {
    collectionUrl: mk(collectionBase),
    deckUrl:       mk(deckBase),
    statsUrl:      mk(statsBase),
  };
}

/* ───────────────────────── Command ───────────────────────── */

export default async function registerLinkDeck(client) {
  const commandData = new SlashCommandBuilder()
    .setName('linkdeck')
    .setDescription('Link your Discord to create/update your TCG profile and get your personal links.')
    .setDMPermission(false);

  client.slashData.push(commandData.toJSON());

  client.commands.set('linkdeck', {
    data: commandData,
    async execute(interaction) {
      const userId    = interaction.user.id;
      const userName  = interaction.user.username;
      const channelId = interaction.channelId;

      // Channel guard
      if (!isAllowedChannel(channelId, ['manageCards'])) {
        return interaction.reply({
          content: '⚠️ This command can only be used in **#manage-cards**.',
          ephemeral: true,
        });
      }

      const CONFIG = loadConfig();

      // Load stores from Persistent Data server
      let linked = {};
      let wallet = {};
      let stats  = {};
      try {
        linked = await loadJSON(PATHS.linkedDecks); // object map keyed by userId
      } catch (e) {
        console.warn('[linkdeck] linkedDecks load failed (will init):', e?.message || e);
        linked = {};
      }
      try {
        wallet = await loadJSON(PATHS.wallet); // coin balances
      } catch {
        wallet = {};
      }
      try {
        stats = await loadJSON(PATHS.playerData); // wins/losses
      } catch {
        stats = {};
      }

      const existing = linked[userId];
      const alreadyLinked =
        !!existing && typeof existing.token === 'string' && existing.token.length >= 12;

      // Create or update profile skeleton
      if (!existing) {
        linked[userId] = {
          discordId: userId,
          discordName: userName,
          deck: [],
          collection: {},
          createdAt: new Date().toISOString(),
        };
      } else {
        // Refresh display name and normalize shapes
        existing.discordName = userName;
        existing.collection  = normalizeCollectionMap(existing.collection || {});
        if (!Array.isArray(existing.deck)) existing.deck = [];
      }

      // Ensure persistent token (only mint if missing)
      if (!alreadyLinked) {
        if (typeof linked[userId].token !== 'string' || linked[userId].token.length < 12) {
          linked[userId].token = randomToken(24);
        }
      }

      linked[userId].lastLinkedAt = new Date().toISOString();

      // Ensure wallet & stats entries exist
      if (typeof wallet[userId] !== 'number') wallet[userId] = Number(existing?.coins ?? 0) || 0;
      if (!stats[userId]) stats[userId] = { wins: 0, losses: 0 };

      // Persist all three in Persistent Data server
      try {
        await saveJSON(PATHS.linkedDecks, linked);
        await saveJSON(PATHS.wallet, wallet);
        await saveJSON(PATHS.playerData, stats);
      } catch (e) {
        console.error('❌ [linkdeck] Failed to persist profile/wallet/stats:', e?.message || e);
        return interaction.reply({
          content: '❌ Failed to save your profile. Please try again later.',
          ephemeral: true,
        });
      }

      // Build personalized links
      const token = linked[userId].token;
      const { collectionUrl, deckUrl, statsUrl } = buildUIUrls(CONFIG, token);

      const lines = [];

      if (alreadyLinked) {
        // ✅ Show “already linked” warning & links
        lines.push('ℹ️ You’re **already linked**. Here are your personal links:');
        lines.push('');
      } else {
        // First-time link copy
        lines.push('✅ Your profile has been created and linked!');
        lines.push('');
      }

      if (collectionUrl) lines.push(`• **Collection:** ${collectionUrl}`);
      if (deckUrl)       lines.push(`• **Deck Builder:** ${deckUrl}`);
      if (statsUrl)      lines.push(`• **Stats & Coins:** ${statsUrl}`);

      if (!collectionUrl && !deckUrl && !statsUrl) {
        lines.push(
          '',
          '⚠️ No UI base URLs are configured. Ask an admin to set these in `CONFIG_JSON` or `config.json`:',
          '```json\n{"collection_ui":"https://madv313.github.io/Card-Collection-UI/","deck_builder_ui":"https://madv313.github.io/Deck-Builder-UI/","stats_leaderboard_ui":"https://madv313.github.io/Stats-Leaderboard-UI/","api_base":"https://<your-backend>/","image_base":"https://madv313.github.io/Card-Collection-UI/images/cards"}\n```',
          `Your token (save this): \`${token}\``
        );
      }

      lines.push('', 'Use **/buycard** to start collecting cards.');
      if (alreadyLinked) lines.push('Ask and admin to use **/unlinkdeck** to reset your link if needed.');

      return interaction.reply({
        content: lines.join('\n'),
        ephemeral: true,
      });
    },
  });
}
