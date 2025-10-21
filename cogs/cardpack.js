// cogs/cardpack.js — Admin-only command to grant a 3-card pack, persist to player collection,
// and generate a reveal JSON keyed by USER and TOKEN (for tokenized per-player Pack Reveal links)
// UPDATED FOR REMOTE PERSISTENCE:
//  • linked_decks.json loaded/saved via storageClient (remote)
//  • reveal JSONs saved remotely at public/data/reveal_<userId>.json and public/data/reveal_<token>.json
//  • [STORAGE] logs + adminAlert on failed saves
//  • All existing logic/UX retained (pagination, token mint, DM link, etc.)

import fs from 'fs/promises';             // kept ONLY for reading CoreMasterReference.json
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder
} from 'discord.js';

import { loadJSON, saveJSON } from '../utils/storageClient.js';
import { PATHS } from '../utils/storageClient.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';

/* ---------------- local-only file (card list) ---------------- */
const cardListPath = path.resolve('./logic/CoreMasterReference.json');

/* ---------------- config loader (ENV first, then config.json) ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[cardpack] CONFIG_JSON parse error: ${e?.message}`);
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
  // Prefer explicit Pack Reveal UI, then general frontend base if provided
  return resolveBaseUrl(cfg.pack_reveal_ui || cfg.frontend_url || cfg.ui_base || cfg.UI_BASE || '');
}

function resolveCollectionBase(cfg) {
  // Prefer explicit Collection UI; fall back to general base
  return resolveBaseUrl(
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    ''
  );
}

/* ---------------- helpers ---------------- */
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

function sanitizeNameForFile(name = '') {
  // Keep letters, numbers, dot, dash, underscore (safe for cross-platform)
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '');
}

// Weighted draw using rarity map without building a giant pool each time
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
    // Binary search for first acc >= r
    let lo = 0, hi = items.length - 1, ans = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].acc >= r) { ans = mid; hi = mid - 1; } else { lo = mid + 1; }
    }
    // Return a shallow clone to avoid accidental mutation
    return { ...items[ans].card };
  };
}

/* ---------------- safe storage wrappers ---------------- */
async function _loadJSONSafe(name) {
  try { return await loadJSON(name); }
  catch (e) { L.storage(`load fail ${name}: ${e.message}`); throw e; }
}
async function _saveJSONSafe(name, data, client) {
  try { await saveJSON(name, data); }
  catch (e) {
    await adminAlert(client, process.env.PAYOUTS_CHANNEL_ID, `${name} save failed: ${e.message}`);
    throw e;
  }
}

/* ---------------- command registration ---------------- */
export default async function registerCardPack(client) {
  const CONFIG = loadConfig();

  const ADMIN_ROLE_ID     = String(CONFIG.admin_role_ids?.[0] || '1173049392371085392'); // fallback to your default
  const ADMIN_CHANNEL_ID  = String(CONFIG.admin_tools_channel_id || CONFIG.admin_channel_id || '1368023977519222895');

  const PACK_REVEAL_BASE  = resolvePackRevealBase(CONFIG) || 'https://madv313.github.io/Pack-Reveal-UI';
  const COLLECTION_BASE   = resolveCollectionBase(CONFIG)  || 'https://madv313.github.io/Card-Collection-UI';
  const API_BASE          = resolveBaseUrl(CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || '');

  const commandData = new SlashCommandBuilder()
    .setName('cardpack')
    .setDescription('Admin only: Send a pack of 3 random cards to a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('cardpack', {
    data: commandData,
    async execute(interaction) {
      // --- Admin checks (role + channel) ---
      const hasAdminRole = Boolean(interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID));
      if (!hasAdminRole) {
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      }
      if (interaction.channelId !== ADMIN_CHANNEL_ID) {
        return interaction.reply({ content: '❌ This command must be used in the admin-tools channel.', ephemeral: true });
      }

      // --- Load linked users for dropdown (ONLY linked users are eligible) ---
      const linkedData = await _loadJSONSafe(PATHS.linkedDecks);  // REMOTE
      const entries = Object.entries(linkedData);
      if (!entries.length) {
        return interaction.reply({ content: '⚠️ No linked users found.', ephemeral: true });
      }

      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(entries.length / pageSize);

      const makePage = (p) => {
        const slice = entries.slice(p * pageSize, (p + 1) * pageSize);
        const options = slice.map(([id, u]) => ({
          label: u.discordName || id,
          value: id
        }));

        const dropdown = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cardpack_user_select')
            .setPlaceholder('👤 Select a linked player to send a pack')
            .addOptions(options)
        );

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev_user_page').setStyle(ButtonStyle.Secondary).setLabel('⏮ Prev').setDisabled(p === 0),
          new ButtonBuilder().setCustomId('next_user_page').setStyle(ButtonStyle.Secondary).setLabel('Next ⏭').setDisabled(p === pages - 1)
        );

        const embed = new EmbedBuilder()
          .setTitle('🎁 Select Player for Card Pack')
          .setDescription(`Page ${p + 1} of ${pages}`);

        return { embed, dropdown, buttons };
      };

      const first = makePage(page);

      await interaction.reply({
        content: '🎯 Choose the player to receive the card pack:',
        embeds: [first.embed],
        components: [first.dropdown, first.buttons],
        ephemeral: true
      });

      // Collectors for pagination & selection
      const btnCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id
      });

      const selectCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id && i.customId === 'cardpack_user_select'
      });

      btnCollector.on('collect', async i => {
        await i.deferUpdate();
        if (i.customId === 'prev_user_page') page = Math.max(0, page - 1);
        if (i.customId === 'next_user_page') page = Math.min(pages - 1, page + 1);
        const next = makePage(page);
        try {
          await interaction.editReply({ embeds: [next.embed], components: [next.dropdown, next.buttons] });
        } catch {}
      });

      selectCollector.on('collect', async i => {
        btnCollector.stop();
        selectCollector.stop();

        const userId = i.values[0];
        const targetUser = await client.users.fetch(userId).catch(() => null);
        if (!targetUser) {
          return i.update({ content: '⚠️ Could not fetch that user.', embeds: [], components: [] });
        }

        // --- Load cards (skip #000 / back) — LOCAL READ OK ---
        let allCards = [];
        try {
          const raw = await fs.readFile(cardListPath, 'utf-8');
          const parsed = JSON.parse(raw);
          const source = Array.isArray(parsed) ? parsed : (parsed.cards || []);
          allCards = source
            .map(c => ({ ...c, card_id: String(c.card_id).padStart(3, '0') }))
            .filter(card => card.card_id !== '000');
        } catch (err) {
          console.error('❌ [cardpack] Failed to load card list:', err);
          return i.update({ content: '⚠️ Failed to load card list.', embeds: [], components: [] });
        }
        if (!allCards.length) {
          return i.update({ content: '⚠️ Card list is empty.', embeds: [], components: [] });
        }

        // --- Weighted picker by rarity ---
        const rarityWeights = { Common: 5, Uncommon: 3, Rare: 2, Legendary: 1 };
        const pickCard = makeWeightedPicker(allCards, rarityWeights);
        const drawnCards = [pickCard(), pickCard(), pickCard()];

        // --- Ensure profile exists & token minted (REMOTE) ---
        const latestLinked = await _loadJSONSafe(PATHS.linkedDecks);
        const username = targetUser.username;

        if (!latestLinked[userId]) {
          latestLinked[userId] = {
            discordName: username,
            deck: [],
            collection: {},
            createdAt: new Date().toISOString()
          };
        } else if (latestLinked[userId].discordName !== username) {
          latestLinked[userId].discordName = username; // keep display name fresh
        }
        if (!latestLinked[userId].token || typeof latestLinked[userId].token !== 'string' || latestLinked[userId].token.length < 12) {
          latestLinked[userId].token = randomToken(24);
        }
        latestLinked[userId].lastPackGrantedAt = new Date().toISOString();

        const userProfile = latestLinked[userId];

        // --- Apply draws to collection & craft reveal payload ---
        const revealJson = [];
        const newIds = [];

        for (const card of drawnCards) {
          const idStr = String(card.card_id).padStart(3, '0');
          const owned = Number(userProfile.collection[idStr] || 0);
          const isNew = owned === 0;

          const filename =
            card.filename
              ? sanitizeNameForFile(card.filename)
              : `${idStr}_${sanitizeNameForFile(card.name)}_${sanitizeNameForFile(card.type)}.png`;

          userProfile.collection[idStr] = owned + 1;
          if (isNew) newIds.push(idStr);

          revealJson.push({
            card_id: `#${idStr}`,
            name: card.name,
            rarity: card.rarity || 'Common',
            filename,
            isNew,
            owned: userProfile.collection[idStr]
          });
        }

        // --- Persist linked decks (REMOTE) ---
        try {
          await _saveJSONSafe(PATHS.linkedDecks, latestLinked, client);
        } catch (e) {
          return i.update({ content: '⚠️ Failed to save player state (linked decks).', embeds: [], components: [] });
        }

        // --- Persist reveal files (REMOTE) ---
        const userRevealName  = `public/data/reveal_${userId}.json`;
        const tokenRevealName = `public/data/reveal_${userProfile.token}.json`;

        try {
          await _saveJSONSafe(userRevealName, revealJson, client);
          await _saveJSONSafe(tokenRevealName, revealJson, client);
        } catch (e) {
          return i.update({ content: '⚠️ Cards granted, but failed to persist reveal JSON remotely.', embeds: [], components: [] });
        }

        // --- Compose URLs (Pack Reveal + Collection with highlights) ---
        const apiQP  = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';
        const ts     = Date.now();
        const newCsv = newIds.join(',');

        const collectionUrlBase = `${COLLECTION_BASE}/?token=${encodeURIComponent(userProfile.token)}${apiQP}`;
        const collectionUrlWithFlags =
          `${collectionUrlBase}&fromPackReveal=true${newCsv ? `&new=${encodeURIComponent(newCsv)}` : ''}&ts=${ts}`;

        const tokenUrl =
          `${PACK_REVEAL_BASE}/?token=${encodeURIComponent(userProfile.token)}${apiQP}` +
          `&next=${encodeURIComponent(collectionUrlWithFlags)}&ts=${ts}`;

        // --- Update the ephemeral admin message with QA links (keeps token private) ---
        const qaRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('🔎 Open Pack Reveal (QA)')
            .setURL(tokenUrl),
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('📇 Open Collection (highlighted)')
            .setURL(collectionUrlWithFlags)
        );

        await i.update({
          content: `📦 Pack created for <@${userId}>. QA shortcuts:`,
          embeds: [],
          components: [qaRow]
        });

        // --- DM the user with one clear masked link sentence ---
        try {
          await targetUser.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎁 You’ve received a new card pack!')
                .setDescription('Tap to open your 3-card reveal.')
                .setURL(tokenUrl)
                .setColor(0x00ccff)
            ],
            content: `🔓 **Open your pack:** [Click here to reveal your cards](${tokenUrl})`
          });
        } catch (err) {
          console.warn(`⚠️ [cardpack] Could not DM user ${userId}`, err);
          await interaction.followUp({
            content: '⚠️ Cards granted, but failed to send DM. Notify the player manually.',
            ephemeral: true
          });
          return;
        }

        // Optional: small confirmation follow-up (keeps the QA buttons visible)
        await interaction.followUp({
          content: `✅ Pack sent to <@${userId}>. Added 3 cards and generated a tokenized reveal.`,
          ephemeral: true
        });
      });
    }
  });
}
