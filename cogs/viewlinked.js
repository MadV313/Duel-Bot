// cogs/viewlinked.js — Paginated with synced dropdown and profile viewer
// Additions:
//  • Token-aware deep link to the Card Collection UI for the selected user
//  • Ensures a token exists for each user (mints & persists if missing)
//  • Prefers coins from linked_decks.json (fallback to coin_bank.json)
//  • Adds a "View Cards" LINK button next to the profile info

import fs from 'fs/promises';
import path from 'path';
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
import crypto from 'crypto';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath    = path.resolve('./data/coin_bank.json');
const playerDataPath  = path.resolve('./data/player_data.json');

/* ---------------- config helpers (matches duelcard/duelcoin style) ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[viewlinked] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }
function resolveCollectionBase(cfg) {
  return trimBase(
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    'https://madv313.github.io/Card-Collection-UI'
  );
}
function resolveApiBase(cfg) {
  return trimBase(cfg.api_base || cfg.API_BASE || process.env.API_BASE || '');
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

export default async function registerViewLinked(client) {
  const CFG = loadConfig();
  const COLLECTION_BASE = resolveCollectionBase(CFG);
  const API_BASE        = resolveApiBase(CFG);
  const apiQP           = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

  const commandData = new SlashCommandBuilder()
    .setName('viewlinked')
    .setDescription('Admin only: View all currently linked users and inspect profiles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('viewlinked', {
    data: commandData,
    async execute(interaction) {
      const userRoles = interaction.member?.roles?.cache;
      const isAdmin   = userRoles?.has(ADMIN_ROLE_ID);
      const channelId = interaction.channelId;

      if (!isAdmin) {
        return interaction.reply({
          content: '🚫 You do not have permission to use this command.',
          ephemeral: true
        });
      }

      if (channelId !== ADMIN_CHANNEL_ID) {
        return interaction.reply({
          content: '❌ This command MUST be used in the SV13 TCG - admin tools channel.',
          ephemeral: true
        });
      }

      let linkedData = {};
      try {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        linkedData = JSON.parse(raw);
      } catch {
        return interaction.reply({
          content: '⚠️ No linked users found.',
          ephemeral: true
        });
      }

      const entries = Object.entries(linkedData || {});
      if (entries.length === 0) {
        return interaction.reply({
          content: '⚠️ No linked profiles found.',
          ephemeral: true
        });
      }

      const pageSize   = 25;
      let currentPage  = 0;
      const totalPages = Math.ceil(entries.length / pageSize);

      const generatePageData = (page) => {
        const pageEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
        const options = pageEntries.map(([id, data]) => ({
          label: data.discordName,
          value: id
        }));

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId(`select_view_profile_page_${page}`)
          .setPlaceholder('🔻 View user profile')
          .addOptions(options);

        const embed = new EmbedBuilder()
          .setTitle(`<:tech_phantoms:1391237241418023075> Linked Users`)
          .setDescription(`Page ${page + 1} of ${totalPages} (Showing ${pageEntries.length} of ${entries.length})`);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        );

        const row = new ActionRowBuilder().addComponents(dropdown);
        return { embed, row, buttons };
      };

      const first = generatePageData(currentPage);

      const reply = await interaction.reply({
        embeds: [first.embed],
        components: [first.row, first.buttons],
        ephemeral: true,
        fetchReply: true
      });

      const buttonCollector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000
      });

      const dropdownCollector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000
      });

      buttonCollector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '⚠️ You can’t interact with this menu.', ephemeral: true });
        }

        if (i.customId === 'prev_page') {
          currentPage = Math.max(currentPage - 1, 0);
        } else if (i.customId === 'next_page') {
          currentPage = Math.min(currentPage + 1, totalPages - 1);
        }

        const { embed, row, buttons } = generatePageData(currentPage);
        await i.update({ embeds: [embed], components: [row, buttons] });
      });

      dropdownCollector.on('collect', async selectInteraction => {
        if (selectInteraction.user.id !== interaction.user.id) {
          return selectInteraction.reply({
            content: '⚠️ You can’t interact with this dropdown.',
            ephemeral: true
          });
        }

        const selectedId = selectInteraction.values[0];
        // Re-read latest to reduce race conditions when tokens/coins change elsewhere
        let latestLinked = {};
        try {
          latestLinked = JSON.parse(await fs.readFile(linkedDecksPath, 'utf-8'));
        } catch {
          latestLinked = linkedData;
        }

        // Ensure profile & token
        const profile = latestLinked[selectedId] || {
          discordName: selectedId,
          deck: [],
          collection: {},
          createdAt: new Date().toISOString()
        };
        if (!profile.token || typeof profile.token !== 'string' || profile.token.length < 12) {
          profile.token = randomToken(24);
          latestLinked[selectedId] = profile;
          // Persist token for future deep links
          try {
            await fs.writeFile(linkedDecksPath, JSON.stringify(latestLinked, null, 2));
          } catch (e) {
            console.warn('[viewlinked] Failed to persist token mint:', e?.message || e);
          }
        }

        // Coins: prefer profile.coins if present, fallback to coin_bank
        let coin = Number(profile.coins ?? 0);
        if (!Number.isFinite(coin) || coin < 0) coin = 0;
        if (coin === 0) {
          try {
            const coinData = JSON.parse(await fs.readFile(coinBankPath, 'utf-8'));
            coin = Number(coinData[selectedId] ?? 0) || coin;
          } catch {}
        }

        // Wins / Losses (optional)
        let wins = 0, losses = 0;
        try {
          const statsData = JSON.parse(await fs.readFile(playerDataPath, 'utf-8'));
          if (statsData[selectedId]) {
            wins   = Number(statsData[selectedId].wins   ?? 0) || 0;
            losses = Number(statsData[selectedId].losses ?? 0) || 0;
          }
        } catch {}

        // Unique unlocked within 001–127
        const ownedIds = Object.keys(profile.collection || {});
        const uniqueUnlocked = ownedIds.filter(id => {
          const parsed = parseInt(id, 10);
          return parsed >= 1 && parsed <= 127;
        }).length;
        const totalOwned = Object.values(profile.collection || {}).reduce((a, b) => a + Number(b || 0), 0);

        const profileEmbed = new EmbedBuilder()
          .setTitle(`<:ID:1391239596112613376> Profile: ${profile.discordName}`)
          .addFields(
            { name: '🂠 Deck Size', value: `${profile.deck?.length || 0}`, inline: true },
            { name: '🀢🀣🀦🀤 Collection Size', value: `${totalOwned}`, inline: true },
            { name: '🀢ᯓ★ Cards Unlocked', value: `${uniqueUnlocked} / 127`, inline: true },
            { name: '⛃ Coins', value: `${coin}`, inline: true },
            { name: '╰── ──╮ Wins / Losses', value: `${wins} / ${losses}`, inline: true }
          )
          .setFooter({ text: `Discord ID: ${selectedId}` });

        // Build tokenized Collection URL (include &api= if configured, plus cache-busting ts)
        const ts = Date.now();
        const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(profile.token)}${apiQP}&ts=${ts}`;

        // Add a LINK button so admins can open the player’s collection directly
        const linkRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(collectionUrl)
            .setLabel('📒 View Cards')
        );

        await selectInteraction.reply({
          embeds: [profileEmbed],
          components: [linkRow],
          ephemeral: true
        });
      });

      dropdownCollector.on('end', async collected => {
        if (collected.size === 0) {
          try {
            await interaction.editReply({
              content: '⏰ No selection made. Command expired.',
              embeds: [],
              components: []
            });
          } catch {}
        }
      });
    }
  });
}
