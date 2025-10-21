// cogs/buycard.js
// Player command to buy a 3-card pack for 3 coins (24h cooldown, 247-cap guard).
// - Role-gated (Supporter or Elite)
// - Channel-locked to #manage-cards
// - Uses persistent data service via utils/storageClient.js
// - Writes per-user reveal JSON under /public/data
// - DMs a Pack-Reveal link (with next= back to Collection UI)

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { requireSupporter } from '../utils/roleGuard.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

// ────────────────────────────────────────────────────────────
// Config helpers
// ────────────────────────────────────────────────────────────
function loadConfig() {
  // Prefer JSON from env (Railway Variables), fallback to config.json if present.
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[buycard] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // Node ESM safe require via createRequire not needed—use fs
    // but this file is optional anyway.
    return {};
  } catch {
    return {};
  }
}

function resolveBaseUrl(s) {
  return (s || '').toString().trim().replace(/\/+$/, '');
}
function resolvePackRevealBase(cfg) {
  return resolveBaseUrl(cfg.pack_reveal_ui || cfg.frontend_url || cfg.ui_base || cfg.UI_BASE || '');
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

// ────────────────────────────────────────────────────────────
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const PACK_COST_COINS = 3;
const MAX_COLLECTION_BEFORE_BUY = 247;

const CORE_PATH = path.resolve('./logic/CoreMasterReference.json');
const REVEAL_DIR = path.resolve('./public/data');

// Unified coin bank file (authoritative); fall back to linked_decks when missing
const COIN_BANK_FILE = (PATHS && PATHS.coinBank) ? PATHS.coinBank : 'data/coin_bank.json';

// ────────────────────────────────────────────────────────────
// Small utils
// ────────────────────────────────────────────────────────────
async function _loadLinkedDecksSafe() {
  try {
    // storageClient.loadJSON already returns parsed JSON (object)
    return await loadJSON(PATHS.linkedDecks);
  } catch (e) {
    L.storage(`load fail ${PATHS.linkedDecks}: ${e.message}`);
    throw e;
  }
}

async function _saveLinkedDecksSafe(data, client) {
  try {
    await saveJSON(PATHS.linkedDecks, data);
  } catch (e) {
    await adminAlert(
      client,
      process.env.ADMIN_PAYOUT_CHANNEL_ID || process.env.ADMIN_PAYOUT_CHANNEL || process.env.ADMIN_PAYOUT_CHANNEL_ID,
      `${PATHS.linkedDecks} save failed: ${e.message}`
    );
    throw e;
  }
}

async function _loadCoinBankSafe() {
  try {
    return await loadJSON(COIN_BANK_FILE);
  } catch (e) {
    L.storage(`load fail ${COIN_BANK_FILE}: ${e.message}`);
    // If not present, start with empty object
    return {};
  }
}
async function _saveCoinBankSafe(data, client) {
  try {
    await saveJSON(COIN_BANK_FILE, data);
  } catch (e) {
    await adminAlert(
      client,
      process.env.ADMIN_PAYOUT_CHANNEL_ID || process.env.ADMIN_PAYOUT_CHANNEL || process.env.ADMIN_PAYOUT_CHANNEL_ID,
      `${COIN_BANK_FILE} save failed: ${e.message}`
    );
    throw e;
  }
}

function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function sanitizeNameForFile(name = '') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '');
}
function sumOwned(collection = {}) {
  let t = 0;
  for (const key of Object.keys(collection)) t += Number(collection[key] || 0);
  return t;
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

// Weighted draw without giant pool
function makeWeightedPicker(cards, weightsByRarity) {
  const items = [];
  let total = 0;
  for (const card of cards) {
    const w = weightsByRarity[card.rarity] ?? 1;
    if (w > 0) {
      total += w;
      items.push({ card, acc: total });
    }
  }
  return function pick() {
    const r = Math.random() * total;
    let lo = 0,
      hi = items.length - 1,
      ans = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].acc >= r) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return { ...items[ans].card };
  };
}

// ────────────────────────────────────────────────────────────
export default async function registerBuyCard(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID = String(
    CONFIG.manage_cards_channel_id ||
      CONFIG.manage_cards ||
      CONFIG['manage-cards'] ||
      process.env.MANAGE_CARDS_CHANNEL_ID ||
      '1367977677658656868'
  );

  const PACK_REVEAL_BASE =
    resolvePackRevealBase(CONFIG) || 'https://madv313.github.io/Pack-Reveal-UI';
  const COLLECTION_BASE =
    resolveCollectionBase(CONFIG) || 'https://madv313.github.io/Card-Collection-UI';
  const API_BASE = resolveBaseUrl(
    CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || ''
  );

  const data = new SlashCommandBuilder()
    .setName('buycard')
    .setDescription(`Buy a 3-card pack for ${PACK_COST_COINS} coins (1 per 24h).`)
    .setDMPermission(false);

  client.slashData.push(data.toJSON());

  client.commands.set('buycard', {
    data,
    async execute(interaction) {
      // Role gate
      if (!requireSupporter(interaction.member)) {
        return interaction.reply({
          ephemeral: true,
          content:
            '❌ You need the **Supporter** or **Elite Collector** role to use this command. Join on Ko-fi to unlock full access.',
        });
      }

      // Channel guard
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content:
            '🛒 Please use this command in the **#manage-cards** channel.',
          ephemeral: true,
        });
      }

      const buyerId = interaction.user.id;
      const buyer = interaction.user;

      // Load master card list (skip #000 back)
      let allCards = [];
      try {
        const raw = await fs.readFile(CORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const source = Array.isArray(parsed) ? parsed : parsed.cards || [];
        allCards = source
          .map((c) => ({
            ...c,
            card_id: String(c.card_id).padStart(3, '0'),
            rarity: c.rarity || 'Common',
            type: c.type || 'Unknown',
          }))
          .filter((c) => c.card_id !== '000');
      } catch (err) {
        console.error('❌ [buycard] Failed to load card list:', err);
        return interaction.reply({
          content: '⚠️ Failed to load card list. Try again later.',
          ephemeral: true,
        });
      }
      if (!allCards.length) {
        return interaction.reply({
          content: '⚠️ Card list is empty.',
          ephemeral: true,
        });
      }

      // Load player profiles from persistent data service
      const linked = await _loadLinkedDecksSafe();
      const profile = linked[buyerId];

      // Not linked → instruct to /linkdeck
      if (!profile) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ Player Not Linked')
          .setDescription(
            [
              'You are not yet linked to the Duel Bot system.',
              '',
              'Please run **`/linkdeck`** in the **#manage-cards** channel before using Duel Bot commands (including buying packs).',
              '',
              'Once linked, you’ll be able to buy packs, build decks, and participate in duels.',
            ].join('\n')
          )
          .setColor(0xff9900);
        return interaction.reply({ embeds: [warn], ephemeral: true });
      }

      // Keep Discord display name fresh, ensure id present
      if (profile.discordName !== buyer.username) profile.discordName = buyer.username;
      if (!profile.discordId) profile.discordId = buyerId;

      // Unified coins source: prefer coin_bank.json, fallback to profile.coins
      const coinBank = await _loadCoinBankSafe();
      const currentCoins = Number(
        (coinBank && coinBank[buyerId] != null) ? coinBank[buyerId] : profile.coins || 0
      );

      // 24h cooldown
      const now = Date.now();
      const last = profile.lastPackPurchasedAt ? Date.parse(profile.lastPackPurchasedAt) : 0;
      if (last && now - last < COOLDOWN_MS) {
        const waitMs = COOLDOWN_MS - (now - last);
        return interaction.reply({
          content:
            `⏳ You can only buy **1 pack per 24 hours**.\n` +
            `Please try again in **${fmtHMS(waitMs)}**.`,
          ephemeral: true,
        });
      }

      // 247-cap
      const ownedTotal = sumOwned(profile.collection || {});
      if (ownedTotal > MAX_COLLECTION_BEFORE_BUY) {
        return interaction.reply({
          content:
            '📦 You must have a maximum of **247 cards** in your collection to buy more. Please sell or discard to make room.',
          ephemeral: true,
        });
      }

      // Coins
      if (currentCoins < PACK_COST_COINS) {
        return interaction.reply({
          content: `💰 You need **${PACK_COST_COINS} coins** to buy a pack. Current balance: **${currentCoins}**.`,
          ephemeral: true,
        });
      }

      // Deduct (write through to BOTH coin_bank.json and profile.coins)
      const newBalance = currentCoins - PACK_COST_COINS;
      profile.coins = newBalance;
      profile.lastCoinsUpdatedAt = new Date().toISOString();
      // also ensure token (for UI links)
      if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
      }

      // Weighted picker
      const rarityWeights = { Common: 5, Uncommon: 3, Rare: 2, Legendary: 1 };
      const pickCard = makeWeightedPicker(allCards, rarityWeights);
      const drawn = [pickCard(), pickCard(), pickCard()];

      // Apply collection & build reveal payload
      const revealJson = [];
      const newIds = [];
      profile.collection ||= {};

      for (const card of drawn) {
        const idStr = String(card.card_id).padStart(3, '0');
        const owned = Number(profile.collection[idStr] || 0);
        const isNew = owned === 0;

        const filename =
          card.filename
            ? sanitizeNameForFile(card.filename)
            : `${idStr}_${sanitizeNameForFile(card.name)}_${sanitizeNameForFile(card.type)}.png`;

        profile.collection[idStr] = owned + 1;
        if (isNew) newIds.push(idStr);

        revealJson.push({
          card_id: `#${idStr}`,
          name: card.name,
          rarity: card.rarity || 'Common',
          filename,
          isNew,
          owned: profile.collection[idStr],
        });
      }

      profile.lastPackPurchasedAt = new Date().toISOString();

      // Persist: update both linked_decks.json and coin_bank.json atomically-ish
      linked[buyerId] = profile;
      coinBank[buyerId] = newBalance;

      await Promise.all([
        _saveLinkedDecksSafe(linked, interaction.client),
        _saveCoinBankSafe(coinBank, interaction.client),
      ]);

      // Persist reveal JSON (both userId and token file for UI)
      await fs.mkdir(REVEAL_DIR, { recursive: true });
      const userRevealPath = path.join(REVEAL_DIR, `reveal_${buyerId}.json`);
      const tokenRevealPath = path.join(REVEAL_DIR, `reveal_${profile.token}.json`);
      await fs.writeFile(userRevealPath, JSON.stringify(revealJson, null, 2));
      await fs.writeFile(tokenRevealPath, JSON.stringify(revealJson, null, 2));

      // Build UI URLs
      const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';
      const ts = Date.now();
      const newCsv = newIds.join(',');

      const collectionUrlBase = `${COLLECTION_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}`;
      const collectionUrlWithFlags =
        `${collectionUrlBase}&fromPackReveal=true` +
        `${newCsv ? `&new=${encodeURIComponent(newCsv)}` : ''}` +
        `&ts=${ts}`;

      const tokenUrl =
        `${PACK_REVEAL_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}` +
        `&next=${encodeURIComponent(collectionUrlWithFlags)}` +
        `&ts=${ts}`;

      // DM link (with pretty embed)
      let dmOk = true;
      try {
        await buyer.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎁 Your new card pack is ready!')
              .setDescription('Tap to open your 3-card reveal.')
              .setURL(tokenUrl)
              .setColor(0x00ccff),
          ],
          content: `🔓 **Open your pack:** [Click here to reveal your cards](${tokenUrl})`,
        });
      } catch (err) {
        dmOk = false;
        console.warn(`⚠️ [buycard] Could not DM user ${buyerId}`, err);
      }

      // Add the same quick links in the ephemeral confirmation (convenient for the buyer)
      const qaRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('🔎 Open Pack Reveal')
          .setURL(tokenUrl),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('📇 Open Collection (highlighted)')
          .setURL(collectionUrlWithFlags)
      );

      // Confirmation
      const msg =
        `✅ Purchase successful! **${PACK_COST_COINS}** coins deducted.\n` +
        `💰 Remaining balance: **${newBalance}** coin${newBalance === 1 ? '' : 's'}.\n` +
        (dmOk
          ? `📨 I’ve sent you a DM with your pack reveal link.`
          : `⚠️ I couldn’t DM you. Please enable DMs from server members and try again.`);

      return interaction.reply({ content: msg, components: [qaRow], ephemeral: true });
    },
  });
}
