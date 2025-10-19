
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
// cogs/duelcoin.js — Admin-only coin adjuster with full debug logging
// Additions:
//  • Token-aware collection link in confirmations (&ts=...)
//  • Ensures target player has a token (mint if missing) for deep-linking
//  • Syncs coin balance into linked_decks.json as well as coin_bank.json
//  • DMs the target user their new balance + collection link (graceful failure handling)

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import crypto from 'crypto';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('PATHS.linkedDecks');
const coinBankPath    = path.resolve('./data/coin_bank.json');

/* ---------------- config helpers (mirrors duelcard style) ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[duelcoin] CONFIG_JSON parse error: ${e?.message}`);
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

export default async function registerDuelCoin(client) {
  const CFG = loadConfig();
  const COLLECTION_BASE = resolveCollectionBase(CFG);
  const API_BASE        = resolveApiBase(CFG);
  const apiQP           = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

  const commandData = new SlashCommandBuilder()
    .setName('duelcoin')
    .setDescription('Admin only: Give or take coins from a player.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('duelcoin', {
    data: commandData,
    async execute(interaction) {
      const timestamp = new Date().toISOString();
      const executor = `${interaction.user.username} (${interaction.user.id})`;

      console.log(`[${timestamp}] 🔸 /duelcoin triggered by ${executor}`);

      const userRoles = interaction.member?.roles?.cache;
      const isAdmin   = userRoles?.has(ADMIN_ROLE_ID);
      const channelId = interaction.channelId;

      if (!isAdmin) {
        console.warn(`[${timestamp}] 🚫 Unauthorized attempt by ${executor}`);
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      }

      if (channelId !== ADMIN_CHANNEL_ID) {
        console.warn(`[${timestamp}] ❌ Wrong channel usage by ${executor} in ${channelId}`);
        return interaction.reply({
          content: '❌ This command MUST be used in the SV13 TCG - admin tools channel.',
          ephemeral: true
        });
      }

      const modeMenu = new StringSelectMenuBuilder()
        .setCustomId('duelcoin_mode')
        .setPlaceholder('🔻 Choose action')
        .addOptions([
          { label: 'Give Coins', value: 'give' },
          { label: 'Take Coins', value: 'take' }
        ]);

      const modeRow = new ActionRowBuilder().addComponents(modeMenu);
      await interaction.reply({
        content: '🪙 Select whether to give or take coins:',
        components: [modeRow],
        ephemeral: true,
        fetchReply: true
      });

      const modeSelect = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 30_000
      });

      const actionMode = modeSelect.values[0];
      console.log(`[${timestamp}] ✅ ${executor} selected mode: ${actionMode.toUpperCase()}`);

      let linkedData = {};
      try {
        const raw = await loadJSON(PATHS.linkedDecks);
        linkedData = JSON.parse(raw);
      } catch {
        console.error(`[${timestamp}] ⚠️ Failed to read linked_decks.json`);
        return modeSelect.reply({ content: '⚠️ Could not load linked users.', ephemeral: true });
      }

      const entries = Object.entries(linkedData);
      if (entries.length === 0) {
        console.warn(`[${timestamp}] ⚠️ No linked profiles found.`);
        return modeSelect.reply({ content: '⚠️ No linked profiles found.', ephemeral: true });
      }

      const pageSize = 25;
      let currentPage = 0;
      const totalPages = Math.ceil(entries.length / pageSize);
      let syncDropdown;
      let paginatedMsg;

      const generatePage = (page) => {
        const pageEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
        const options = pageEntries.map(([id, data]) => ({
          label: data.discordName,
          value: id
        }));

        const embed = new EmbedBuilder()
          .setTitle(`<:ID:1391239596112613376> Select User`)
          .setDescription(`Page ${page + 1} of ${totalPages} — ${entries.length} total users`);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        );

        syncDropdown = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`duelcoin_user_select_${page}`)
            .setPlaceholder('Select a player')
            .addOptions(options)
        );

        return { embed, buttons };
      };

      const updatePagination = async () => {
        const { embed, buttons } = generatePage(currentPage);
        console.log(`[${timestamp}] 🔁 Page changed to ${currentPage + 1} by ${executor}`);
        await paginatedMsg.edit({ embeds: [embed], components: [syncDropdown, buttons] });
      };

      const { embed, buttons } = generatePage(currentPage);
      paginatedMsg = await modeSelect.reply({
        embeds: [embed],
        components: [syncDropdown, buttons],
        ephemeral: true,
        fetchReply: true
      });

      const collector = paginatedMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });

      collector.on('collect', async i => {
        if (i.customId === 'prev_page') currentPage--;
        if (i.customId === 'next_page') currentPage++;
        await updatePagination();
        await i.deferUpdate();
      });

      const dropdownCollector = paginatedMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });

      dropdownCollector.on('collect', async selectInteraction => {
        const targetId = selectInteraction.values[0];
        const targetName = linkedData[targetId]?.discordName || 'Unknown';
        console.log(`[${timestamp}] 🎯 ${executor} selected player: ${targetName} (${targetId})`);

        const modal = new ModalBuilder()
          .setCustomId(`duelcoin:amount:${targetId}:${actionMode}`)
          .setTitle(`${actionMode === 'give' ? 'Give' : 'Take'} Coins from ${targetName}`);

        const input = new TextInputBuilder()
          .setCustomId('coin_amount')
          .setLabel('Enter amount')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('e.g. 10');

        const modalRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(modalRow);

        await selectInteraction.showModal(modal);
      });

      // NOTE: Keep listener as in your original file; scoped filter prevents noise.
      client.on('interactionCreate', async modalInteraction => {
        if (!modalInteraction.isModalSubmit()) return;
        if (!modalInteraction.customId.startsWith('duelcoin:amount:')) return;

        const modalTimestamp = new Date().toISOString();
        const [prefix, formType, userId, mode] = modalInteraction.customId.split(':');
        if (prefix !== 'duelcoin' || formType !== 'amount') return;

        const amountStr = modalInteraction.fields.getTextInputValue('coin_amount');
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount < 1) {
          console.warn(`[${modalTimestamp}] ⚠️ Invalid amount submitted by ${modalInteraction.user.username}`);
          return modalInteraction.reply({ content: '⚠️ Invalid amount.', ephemeral: true });
        }

        // Read coin bank (legacy store)
        let coinData = {};
        try {
          const raw = await loadJSON(PATHS.linkedDecks);
          coinData = JSON.parse(raw);
        } catch {
          console.warn(`[${modalTimestamp}] ⚠️ Could not read coin bank file (will create).`);
        }

        // Ensure linked decks is available & player entry exists
        let linked = {};
        try {
          const raw = await loadJSON(PATHS.linkedDecks);
          linked = JSON.parse(raw);
        } catch {
          console.warn(`[${modalTimestamp}] ⚠️ Could not read linked_decks.json (will create).`);
          linked = {};
        }

        if (!linked[userId]) {
          linked[userId] = {
            discordName: (await modalInteraction.client.users.fetch(userId).catch(() => null))?.username || 'Unknown',
            deck: [],
            collection: {},
            createdAt: new Date().toISOString()
          };
        }

        // Ensure player has a token for deep-linking to collection UI
        if (!linked[userId].token || typeof linked[userId].token !== 'string' || linked[userId].token.length < 12) {
          linked[userId].token = randomToken(24);
        }

        const currentLegacy = coinData[userId] ?? 0;
        const currentLinked = Number(linked[userId].coins ?? currentLegacy ?? 0);

        const newBalance = mode === 'give'
          ? currentLinked + amount
          : Math.max(0, currentLinked - amount);

        // Write both stores to keep backward compat
        coinData[userId]     = newBalance;
        linked[userId].coins = newBalance;
        linked[userId].coinsUpdatedAt = new Date().toISOString();

        const adminUsername = modalInteraction.user.username;
        const targetName    = linked[userId]?.discordName || 'Unknown';

        console.log(`[${modalTimestamp}] 💼 Admin ${adminUsername} executed: ${mode.toUpperCase()} ${amount} coins ${mode === 'give' ? 'to' : 'from'} ${targetName} (${userId}) — New Balance: ${newBalance}`);

        await saveJSON(PATHS.linkedDecks));
        await saveJSON(PATHS.linkedDecks));

        // Build tokenized collection URL (with &ts= for cache-bust; fromPackReveal=false here)
        const ts = Date.now();
        const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(linked[userId].token)}${apiQP}&ts=${ts}`;

        // Non-ephemeral channel confirmation (as before)
        await modalInteraction.reply({
          content: `✅ <@${modalInteraction.user.id}> ${mode === 'give' ? 'gave' : 'took'} ${amount} coins ${mode === 'give' ? 'to' : 'from'} <@${userId}>.\nNew balance 🪙: ${newBalance}\n📒 **View ${targetName}'s Collection:** ${collectionUrl}`,
          ephemeral: false
        });

        // DM the user with their updated balance & the collection link (ignore errors, notify admins in console)
        try {
          const user = await modalInteraction.client.users.fetch(userId);
          const dmEmbed = new EmbedBuilder()
            .setTitle('🪙 Coin Balance Updated')
            .setDescription(`Your new balance is **${newBalance}** coins.`)
            .setColor(0x00ccff);

          await user.send({
            embeds: [dmEmbed],
            content: `View your collection: ${collectionUrl}`
          });
        } catch (e) {
          console.warn(`[${modalTimestamp}] ⚠️ Failed to DM user ${userId}:`, e?.message || e);
          // Optional: also notify admins in-channel (kept minimal to avoid spam)
          try {
            await modalInteraction.followUp({
              content: `⚠️ Could not DM <@${userId}> their updated balance. They may have DMs disabled.`,
              ephemeral: true
            });
          } catch {}
        }
      });
    }
  });
}
