// cogs/duelcoin.js — Admin-only coin adjuster with full debug logging

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
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');

export default async function registerDuelCoin(client) {
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
      const isAdmin = userRoles?.has(ADMIN_ROLE_ID);
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
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
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

        let coinData = {};
        try {
          const raw = await fs.readFile(coinBankPath, 'utf-8');
          coinData = JSON.parse(raw);
        } catch {
          console.warn(`[${modalTimestamp}] ⚠️ Could not read coin bank file.`);
        }

        const current = coinData[userId] ?? 0;
        const newBalance = mode === 'give' ? current + amount : Math.max(0, current - amount);
        coinData[userId] = newBalance;

        const adminUsername = modalInteraction.user.username;
        const targetName = linkedData[userId]?.discordName || 'Unknown';

        console.log(`[${modalTimestamp}] 💼 Admin ${adminUsername} executed: ${mode.toUpperCase()} ${amount} coins ${mode === 'give' ? 'to' : 'from'} ${targetName} (${userId}) — New Balance: ${newBalance}`);

        await fs.writeFile(coinBankPath, JSON.stringify(coinData, null, 2));

        await modalInteraction.reply({
          content: `✅ <@${modalInteraction.user.id}> ${mode === 'give' ? 'gave' : 'took'} ${amount} coins ${mode === 'give' ? 'to' : 'from'} <@${userId}>.\nNew balance 🪙: ${newBalance}`,
          ephemeral: false
        });
      });
    }
  });
}
