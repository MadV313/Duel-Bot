// cogs/cardpack.js — Admin-only command to grant a 3-card pack, persist to player collection,
// and generate a reveal JSON keyed by USER and TOKEN (for tokenized per-player Pack Reveal links)

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ComponentType,
  EmbedBuilder
} from 'discord.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const cardListPath    = path.resolve('./logic/CoreMasterReference.json');
const revealOutputDir = path.resolve('./public/data');

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

/* ---------------- command registration ---------------- */
export default async function registerCardPack(client) {
  const CONFIG = loadConfig();

  const ADMIN_ROLE_ID     = String(CONFIG.admin_role_ids?.[0] || '1173049392371085392');        // fallback to your default
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

      // --- Prompt admin to pick a user ---
      const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId('cardpack_user_select')
          .setPlaceholder('👤 Select a player to send a card pack')
          .setMaxValues(1)
      );

      await interaction.reply({
        content: '🎯 Choose the player to receive the card pack:',
        components: [userSelectRow],
        ephemeral: true
      });

      const userSelection = await interaction.channel
        .awaitMessageComponent({
          componentType: ComponentType.UserSelect,
          time: 30_000,
          filter: i => i.user.id === interaction.user.id
        })
        .catch(() => null);

      if (!userSelection) {
        return interaction.editReply({ content: '⌛ Selection timed out.', components: [] });
      }

      const userId = userSelection.values[0];
      const targetUser = await client.users.fetch(userId).catch(() => null);
      if (!targetUser) {
        return userSelection.update({ content: '⚠️ Could not find user.', components: [] });
      }

      // --- Load cards (skip #000 / back) ---
      let allCards = [];
      try {
        const raw = await fs.readFile(cardListPath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Supports either array of cards or object wrapper { cards: [...] }
        const source = Array.isArray(parsed) ? parsed : (parsed.cards || []);
        allCards = source.filter(card => String(card.card_id).padStart(3, '0') !== '000');
      } catch (err) {
        console.error('❌ [cardpack] Failed to load card list:', err);
        return userSelection.update({ content: '⚠️ Failed to load card list.', components: [] });
      }
      if (!allCards.length) {
        return userSelection.update({ content: '⚠️ Card list is empty.', components: [] });
      }

      // --- Weighted picker by rarity ---
      const rarityWeights = { Common: 5, Uncommon: 3, Rare: 2, Legendary: 1 };
      const pickCard = makeWeightedPicker(allCards, rarityWeights);

      const drawnCards = [pickCard(), pickCard(), pickCard()];

      // --- Ensure player profile exists; mint token if missing ---
      const linkedData = await readJson(linkedDecksPath, {});
      const username = targetUser.username;

      if (!linkedData[userId]) {
        linkedData[userId] = {
          discordName: username,
          deck: [],
          collection: {},
          createdAt: new Date().toISOString()
        };
      } else {
        // keep display name fresh
        if (linkedData[userId].discordName !== username) {
          linkedData[userId].discordName = username;
        }
      }
      if (!linkedData[userId].token || typeof linkedData[userId].token !== 'string' || linkedData[userId].token.length < 12) {
        linkedData[userId].token = randomToken(24);
      }
      linkedData[userId].lastPackGrantedAt = new Date().toISOString();

      const userProfile = linkedData[userId];

      // --- Apply draws to collection & craft reveal payload ---
      const revealJson = [];
      for (const card of drawnCards) {
        const idStr = String(card.card_id).padStart(3, '0');
        const owned = Number(userProfile.collection[idStr] || 0);
        const isNew = owned === 0;

        // Prefer explicit filename from card list when present; otherwise build one
        const filename =
          card.filename
            ? sanitizeNameForFile(card.filename)
            : `${idStr}_${sanitizeNameForFile(card.name)}_${sanitizeNameForFile(card.type)}.png`;

        // Persist collection increment (use 3-digit padded keys to align with your other systems)
        userProfile.collection[idStr] = owned + 1;

        revealJson.push({
          card_id: `#${idStr}`,
          name: card.name,
          rarity: card.rarity || 'Common',
          filename,
          isNew,
          owned: userProfile.collection[idStr]
        });
      }

      // --- Persist linked decks (with updated collection & token) ---
      await writeJson(linkedDecksPath, linkedData);

      // --- Persist reveal files (both USER-ID and TOKEN variants for compatibility) ---
      await fs.mkdir(revealOutputDir, { recursive: true });
      const userRevealPath  = path.join(revealOutputDir, `reveal_${userId}.json`);
      const tokenRevealPath = path.join(revealOutputDir, `reveal_${userProfile.token}.json`);
      await fs.writeFile(userRevealPath, JSON.stringify(revealJson, null, 2));
      await fs.writeFile(tokenRevealPath, JSON.stringify(revealJson, null, 2));

      // --- Compose Pack Reveal link (tokenized, single masked sentence), include &api= if present ---
      const apiQP   = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';
      // NOTE: no /index.html so it matches the requested format
      const tokenUrl = `${PACK_REVEAL_BASE}/?token=${encodeURIComponent(userProfile.token)}${apiQP}`;

      // Optional direct Collection link (kept for future; not used in DM body per spec)
      const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(userProfile.token)}${apiQP}`;

      // --- DM the user with one clear masked link sentence ---
      try {
        await targetUser.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎁 You’ve received a new card pack!')
              .setDescription('Tap to open your 3-card reveal.')
              .setURL(tokenUrl) // keep embed clickable
              .setColor(0x00ccff)
          ],
          // Single sentence with a masked link to the tokenized Pack Reveal URL (optionally carries &api=)
          content: `🔓 **Open your pack:** [Click here to reveal your cards](${tokenUrl})`
        });
      } catch (err) {
        console.warn(`⚠️ [cardpack] Could not DM user ${userId}`, err);
        // We still granted cards & wrote reveal JSON, so inform the admin
        return userSelection.update({ content: '⚠️ Cards granted, but failed to send DM. Notify the player manually.', components: [] });
      }

      return userSelection.update({
        content: `✅ Pack sent to <@${userId}>. Added 3 cards to their collection and generated a tokenized reveal.`,
        components: []
      });
    }
  });
}
