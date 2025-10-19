
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
// cogs/unlinkdeck.js — Paginated version synced with dropdown
// Updates:
// • Keeps existing UX/logic intact
// • Also cleans up any tokenized Pack Reveal JSON for the user (userId + token variants)
// • EXTRA: Wipes related player data in trade_limits.json, trades.json, and duel_sessions.json (if present)
// • Extra logging + safe error handling around file I/O

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

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath   = path.resolve('PATHS.linkedDecks');
const coinBankPath      = path.resolve('./data/coin_bank.json');
const playerDataPath    = path.resolve('PATHS.playerData');
const tradeLimitsPath   = path.resolve('./data/trade_limits.json'); // NEW: wipe per-user counters
const tradesPath        = path.resolve('./data/trades.json');       // NEW: purge sessions with this user
const duelSessionsPath  = path.resolve('./data/duel_sessions.json'); // NEW: optional, purge duels with this user
const revealOutputDir   = path.resolve('./public/data'); // where cardpack writes reveal_<id>.json

async function await _loadJSONSafe(PATHS.linkedDecks) {
  try { return JSON.parse(await loadJSON(PATHS.linkedDecks)); }
  catch { return fallback; }
}
async function await _saveJSONSafe(PATHS.linkedDecks, \1, client) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await saveJSON(PATHS.linkedDecks));
}

export default async function registerUnlinkDeck(client) {
  const commandData = new SlashCommandBuilder()
    .setName('unlinkdeck')
    .setDescription('Admin only: Unlink a user’s card profile.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('unlinkdeck', {
    data: commandData,
    async execute(interaction) {
      const userRoles = interaction.member?.roles?.cache;
      const isAdmin = userRoles?.has(ADMIN_ROLE_ID);
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

      // Load linked users
      let linkedData = {};
      try {
        linkedData = await await _loadJSONSafe(PATHS.linkedDecks);
      } catch {
        console.warn('📁 [unlinkdeck] No linked_decks.json found.');
        return interaction.reply({
          content: '⚠️ No profiles found to unlink.',
          ephemeral: true
        });
      }

      const entries = Object.entries(linkedData);
      if (entries.length === 0) {
        return interaction.reply({
          content: '⚠️ No linked users found.',
          ephemeral: true
        });
      }

      // Pagination builders
      const pageSize = 25;
      let currentPage = 0;
      const totalPages = Math.ceil(entries.length / pageSize);

      const generatePageData = (page) => {
        const pageEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
        const options = pageEntries.map(([id, data]) => ({
          label: data.discordName || id,
          value: id
        }));

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId(`select_unlink_user_page_${page}`)
          .setPlaceholder('🔻 Choose a user to unlink')
          .addOptions(options);

        const embed = new EmbedBuilder()
          .setTitle(`📋 Select a user to unlink`)
          .setDescription(`Page ${page + 1} of ${totalPages} (Showing users ${(page * pageSize) + 1}–${Math.min((page + 1) * pageSize, entries.length)} of ${entries.length})`);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        );

        const row = new ActionRowBuilder().addComponents(dropdown);

        return { embed, row, buttons, pageEntries };
      };

      const { embed, row, buttons } = generatePageData(currentPage);

      const mainReply = await interaction.reply({
        embeds: [embed],
        components: [row, buttons],
        ephemeral: true,
        fetchReply: true
      });

      const collector = mainReply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });

      const dropdownCollector = mainReply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });
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
        if (!selectInteraction.customId.startsWith('select_unlink_user_page_')) return;

        const selectedId = selectInteraction.values[0];
        const removedUser  = linkedData[selectedId]?.discordName || 'Unknown';
        const removedToken = linkedData[selectedId]?.token || '';

        // 1) Remove from linked_decks.json
        try {
          delete linkedData[selectedId];
          await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
          console.log(`🗑 [unlinkdeck] Removed profile for ${selectedId}`);
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to update linked_decks.json:', e?.message || e);
        }

        // 2) Remove from coin_bank.json
        try {
          const coinData = await await _loadJSONSafe(PATHS.linkedDecks);
          if (coinData && Object.prototype.hasOwnProperty.call(coinData, selectedId)) {
            delete coinData[selectedId];
            await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
            console.log(`💰 [unlinkdeck] Removed coin data for ${selectedId}`);
          }
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to update coin_bank.json:', e?.message || e);
        }

        // 3) Remove from player_data.json
        try {
          const playerData = await await _loadJSONSafe(PATHS.linkedDecks);
          if (playerData && Object.prototype.hasOwnProperty.call(playerData, selectedId)) {
            delete playerData[selectedId];
            await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
            console.log(`📊 [unlinkdeck] Removed player data for ${selectedId}`);
          }
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to update player_data.json:', e?.message || e);
        }

        // 4) NEW: Remove from trade_limits.json
        try {
          const limits = await await _loadJSONSafe(PATHS.linkedDecks);
          if (limits && Object.prototype.hasOwnProperty.call(limits, selectedId)) {
            delete limits[selectedId];
            await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
            console.log(`🔁 [unlinkdeck] Cleared trade limits for ${selectedId}`);
          }
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to update trade_limits.json:', e?.message || e);
        }

        // 5) NEW: Purge any trade sessions in trades.json involving this user
        try {
          const trades = await await _loadJSONSafe(PATHS.linkedDecks);
          let changed = false;
          for (const [sid, sess] of Object.entries(trades)) {
            const a = sess?.initiator?.userId;
            const b = sess?.partner?.userId;
            if (a === selectedId || b === selectedId) {
              delete trades[sid];
              changed = true;
            }
          }
          if (changed) {
            await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
            console.log(`🔄 [unlinkdeck] Purged trade sessions for ${selectedId}`);
          }
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to update trades.json:', e?.message || e);
        }

        // 6) NEW: Purge any duel sessions in duel_sessions.json involving this user (if file exists)
        try {
          const duels = await await _loadJSONSafe(PATHS.linkedDecks);
          let changed = false;
          // Format-agnostic best effort: remove any session where players array contains user,
          // or any object with .aId/.bId/.players[*].userId equal to selectedId
          for (const [sid, s] of Object.entries(duels)) {
            const players = Array.isArray(s?.players) ? s.players : [];
            const containsInPlayers = players.some(p => String(p?.userId || p?.id) === String(selectedId));
            const aMatch = String(s?.aId || s?.challenger?.userId) === String(selectedId);
            const bMatch = String(s?.bId || s?.opponent?.userId) === String(selectedId);
            if (containsInPlayers || aMatch || bMatch) {
              delete duels[sid];
              changed = true;
            }
          }
          if (changed) {
            await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
            console.log(`⚔️ [unlinkdeck] Purged duel sessions for ${selectedId}`);
          }
        } catch (e) {
          // This file may not exist in your setup; ignore if missing.
          console.warn('ℹ️ [unlinkdeck] duel_sessions.json not updated (may not exist).', e?.message || e);
        }

        // 7) Clean up any Pack Reveal JSON files for this user (user + token variants)
        try {
          const userRevealPath  = path.join(revealOutputDir, `reveal_${selectedId}.json`);
          await fs.unlink(userRevealPath).catch(() => {});
          if (removedToken) {
            const tokenRevealPath = path.join(revealOutputDir, `reveal_${removedToken}.json`);
            await fs.unlink(tokenRevealPath).catch(() => {});
          }
          console.log(`🧹 [unlinkdeck] Cleaned reveal JSON for ${selectedId}${removedToken ? ` (token ${removedToken})` : ''}`);
        } catch (e) {
          console.warn('⚠️ [unlinkdeck] Failed to clean reveal files:', e?.message || e);
        }

        // Done
        await selectInteraction.update({
          content: `✅ Successfully unlinked **${removedUser}** and wiped their associated data.`,
          embeds: [],
          components: []
        });

        try { collector.stop(); } catch {}
        try { dropdownCollector.stop(); } catch {}
      });

      dropdownCollector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: '⏰ No selection made. Command cancelled.',
            embeds: [],
            components: []
          });
        }
      });
    }
  });
}
