// cogs/buycard.js — Player command to buy a 3-card pack for 3 coins.
// - Confined to #manage-cards channel
// - Warns if not linked
// - 24h cooldown, 247-cap guard, 3-coin price
// - Ensures/stores player token automatically
// - Writes tokenized reveal JSON and DMs reveal link
// - Small extra logging

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

/* ---------------- paths ---------------- */
const linkedDecksPath = path.resolve('./data/linked_decks.json');
const cardListPath    = path.resolve('./logic/CoreMasterReference.json');
const revealOutputDir = path.resolve('./public/data');

/* ---------------- config helpers ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[buycard] CONFIG_JSON parse error: ${e?.message}`);
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

// Weighted draw using rarity weights without creating a giant pool
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
    let lo = 0, hi = items.length - 1, ans = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].acc >= r) { ans = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    return { ...items[ans].card };
  };
}

/* ---------------- constants ---------------- */
const PACK_COST_COINS = 3;              // confirmed rule
const MAX_COLLECTION_BEFORE_BUY = 247;  // must have <= 247 to buy more
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/* ---------------- command registration ---------------- */
export default async function registerBuyCard(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  const PACK_REVEAL_BASE  = resolvePackRevealBase(CONFIG) || 'https://madv313.github.io/Pack-Reveal-UI';
  const COLLECTION_BASE   = resolveCollectionBase(CONFIG)  || 'https://madv313.github.io/Card-Collection-UI';
  const API_BASE          = resolveBaseUrl(CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || '');

  const commandData = new SlashCommandBuilder()
    .setName('buycard')
    .setDescription(`Buy a 3-card pack for ${PACK_COST_COINS} coins (1 per 24h).`)
    .setDMPermission(false); // ✅ guild only

  client.slashData.push(commandData.toJSON());

  client.commands.set('buycard', {
    data: commandData,
    async execute(interaction) {
      // Tiny audit breadcrumb
      console.log(`[buycard] invoked by ${interaction.user?.tag} (${interaction.user?.id}) in #${interaction.channelId}`);

      // Channel guard
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: '🛒 Please use this command in the **#manage-cards** channel.',
          ephemeral: true
        });
      }

      const buyerId = interaction.user.id;
      const buyer   = interaction.user;

      // Load cards (skip #000 back)
      let allCards = [];
      try {
        const raw = await fs.readFile(cardListPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const source = Array.isArray(parsed) ? parsed : (parsed.cards || []);
        allCards = source
          .map(c => ({ ...c, card_id: String(c.card_id).padStart(3, '0') }))
          .filter(card => card.card_id !== '000');
      } catch (err) {
        console.error('❌ [buycard] Failed to load card list:', err);
        return interaction.reply({ content: '⚠️ Failed to load card list. Try again later.', ephemeral: true });
      }
      if (!allCards.length) {
        return interaction.reply({ content: '⚠️ Card list is empty.', ephemeral: true });
      }

      // Load player profile
      const linked = await readJson(linkedDecksPath, {});
      const profile = linked[buyerId];

      // If player is not linked, warn and exit
      if (!profile) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ Player Not Linked')
          .setDescription(
            [
              'You are not yet linked to the Duel Bot system.',
              '',
              'Please run **`/linkdeck`** in the **#manage-cards** channel before using Duel Bot commands (including buying packs).',
              '',
              'Once linked, you’ll be able to buy packs, build decks, and participate in duels.'
            ].join('\n')
          )
          .setColor(0xff9900);
        return interaction.reply({ embeds: [warn], ephemeral: true });
      }

      // Keep Discord display name fresh
      if (profile.discordName !== buyer.username) {
        profile.discordName = buyer.username;
      }

      const currentCoins = Number(profile.coins || 0);

      // Enforce 24h cooldown
      const now = Date.now();
      const last = profile.lastPackPurchasedAt ? Date.parse(profile.lastPackPurchasedAt) : 0;
      if (last && now - last < COOLDOWN_MS) {
        const waitMs = COOLDOWN_MS - (now - last);
        return interaction.reply({
          content: `⏳ You can only buy **1 pack per 24 hours**.\nPlease try again in **${fmtHMS(waitMs)}**.`,
          ephemeral: true
        });
      }

      // Enforce 247 collection cap
      const ownedTotal = sumOwned(profile.collection || {});
      if (ownedTotal > MAX_COLLECTION_BEFORE_BUY) {
        return interaction.reply({
          content: '📦 You must have a maximum of **247 cards** in your collection to buy more. Please sell or discard to make room.',
          ephemeral: true
        });
      }

      // Check coins
      if (currentCoins < PACK_COST_COINS) {
        return interaction.reply({
          content: `💰 You need **${PACK_COST_COINS} coins** to buy a pack. Current balance: **${currentCoins}**.`,
          ephemeral: true
        });
      }

      // Deduct coins
      profile.coins = currentCoins - PACK_COST_COINS;

      // Ensure token automatically (no user input)
      if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
      }

      // Weighted picker
      const rarityWeights = { Common: 5, Uncommon: 3, Rare: 2, Legendary: 1 };
      const pickCard = makeWeightedPicker(allCards, rarityWeights);
      const drawn = [pickCard(), pickCard(), pickCard()];

      // Apply to collection & build reveal payload
      const revealJson = [];
      const newIds = [];

      for (const card of drawn) {
        const idStr = String(card.card_id).padStart(3, '0');
        const owned = Number(profile.collection?.[idStr] || 0);
        const isNew = owned === 0;

        const filename =
          card.filename
            ? sanitizeNameForFile(card.filename)
            : `${idStr}_${sanitizeNameForFile(card.name)}_${sanitizeNameForFile(card.type)}.png`;

        profile.collection = profile.collection || {};
        profile.collection[idStr] = owned + 1;
        if (isNew) newIds.push(idStr);

        revealJson.push({
          card_id: `#${idStr}`,
          name: card.name,
          rarity: card.rarity || 'Common',
          filename,
          isNew,
          owned: profile.collection[idStr]
        });
      }

      profile.lastPackPurchasedAt = new Date().toISOString();

      // Persist profile + reveal files
      await writeJson(linkedDecksPath, linked);

      await fs.mkdir(revealOutputDir, { recursive: true });
      const userRevealPath  = path.join(revealOutputDir, `reveal_${buyerId}.json`);
      const tokenRevealPath = path.join(revealOutputDir, `reveal_${profile.token}.json`);
      await fs.writeFile(userRevealPath,  JSON.stringify(revealJson, null, 2));
      await fs.writeFile(tokenRevealPath, JSON.stringify(revealJson, null, 2));

      // Build URLs
      const API_BASE = resolveBaseUrl(loadConfig().api_base || process.env.API_BASE || '');
      const apiQP  = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';
      const ts     = Date.now();
      const newCsv = newIds.join(',');

      const collectionUrlBase =
        `${COLLECTION_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}`;
      const collectionUrlWithFlags =
        `${collectionUrlBase}&fromPackReveal=true${newCsv ? `&new=${encodeURIComponent(newCsv)}` : ''}&ts=${ts}`;

      const tokenUrl =
        `${PACK_REVEAL_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}` +
        `&next=${encodeURIComponent(collectionUrlWithFlags)}`;

      // DM buyer with masked link
      let dmOk = true;
      try {
        await buyer.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎁 Your new card pack is ready!')
              .setDescription('Tap to open your 3-card reveal.')
              .setURL(tokenUrl)
              .setColor(0x00ccff)
          ],
          content: `🔓 **Open your pack:** [Click here to reveal your cards](${tokenUrl})`
        });
      } catch (err) {
        dmOk = false;
        console.warn(`⚠️ [buycard] Could not DM user ${buyerId}`, err);
      }

      // Follow-up confirmation with remaining coins
      const msg =
        `✅ Purchase successful! **${PACK_COST_COINS}** coins deducted.\n` +
        `💰 Remaining balance: **${profile.coins}** coin${profile.coins === 1 ? '' : 's'}.\n` +
        (dmOk
          ? `📨 I’ve sent you a DM with your pack reveal link.`
          : `⚠️ I couldn’t DM you. Please enable DMs from server members and try again.`);

      return interaction.reply({ content: msg, ephemeral: true });
    }
  });
}
