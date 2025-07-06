// cogs/duelcard.js — Admin-only card give/take command

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

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const cardListPath = path.resolve('./logic/CoreMasterReference.json');

export default async function registerDuelCard(client) {
  const commandData = new SlashCommandBuilder()
    .setName('duelcard')
    .setDescription('Admin only: Give or take cards from a player.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('duelcard', {
    data: commandData,
    async execute(interaction) {
      const timestamp = new Date().toISOString();
      const executor = `${interaction.user.username} (${interaction.user.id})`;

      console.log(`[${timestamp}] 🔸 /duelcard triggered by ${executor}`);

      const isAdmin = interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID);
      if (!isAdmin) {
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      }

      if (interaction.channelId !== ADMIN_CHANNEL_ID) {
        return interaction.reply({
          content: '❌ This command MUST be used in the SV13 TCG - admin tools channel.',
          ephemeral: true
        });
      }

      const modeMenu = new StringSelectMenuBuilder()
        .setCustomId('duelcard_mode')
        .setPlaceholder('🃏 Choose action')
        .addOptions([
          { label: 'Give Card', value: 'give' },
          { label: 'Take Card', value: 'take' }
        ]);
      const modeRow = new ActionRowBuilder().addComponents(modeMenu);

      await interaction.reply({
        content: '🃏 Select whether to give or take a card:',
        components: [modeRow],
        ephemeral: true,
        fetchReply: true
      });

      const modeSelect = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 30_000
      });
      const actionMode = modeSelect.values[0];
      await modeSelect.deferUpdate();

      let linkedData = {};
      try {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        linkedData = JSON.parse(raw);
      } catch {
        return interaction.editReply({ content: '⚠️ Could not load linked users.', components: [] });
      }

      const entries = Object.entries(linkedData);
      if (entries.length === 0) {
        return interaction.editReply({ content: '⚠️ No linked profiles found.', components: [] });
      }

      const pageSize = 25;
      let currentPage = 0;
      const totalPages = Math.ceil(entries.length / pageSize);

      const generateUserPage = (page) => {
        const pageEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
        const options = pageEntries.map(([id, data]) => ({
          label: data.discordName,
          value: id
        }));

        const embed = new EmbedBuilder()
          .setTitle(`👤 Select Target Player`)
          .setDescription(`Page ${page + 1} of ${totalPages}`);

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev_user_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('next_user_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        );

        const dropdown = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('duelcard_user_select')
            .setPlaceholder('Select a player')
            .addOptions(options)
        );

        return { embed, buttons, dropdown };
      };

      const updatePage = async () => {
        const { embed, buttons, dropdown } = generateUserPage(currentPage);
        await interaction.editReply({ embeds: [embed], components: [dropdown, buttons] });
      };

      await updatePage();

      const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return;
        if (i.customId === 'prev_user_page') currentPage--;
        if (i.customId === 'next_user_page') currentPage++;
        await i.deferUpdate();
        await updatePage();
      });

      const dropdownCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });

      dropdownCollector.on('collect', async selectInteraction => {
        if (selectInteraction.user.id !== interaction.user.id || !selectInteraction.customId.includes('duelcard_user_select')) return;
        await selectInteraction.deferUpdate();

        const targetId = selectInteraction.values[0];
        const targetName = linkedData[targetId]?.discordName || 'Unknown';
        console.log(`[${timestamp}] 🎯 ${executor} selected player: ${targetName} (${targetId})`);

        let cardData = [];
        try {
          const raw = await fs.readFile(cardListPath, 'utf-8');
          cardData = JSON.parse(raw);
        } catch {
          return interaction.followUp({ content: '⚠️ Could not load card data.', ephemeral: true });
        }

        const cardEntries = cardData
          .filter(card => card.card_id !== '000')
          .map(card => ({
            label: `${card.card_id} ${card.name}`.slice(0, 100),
            value: String(card.card_id)
          }));

        const cardPages = Math.ceil(cardEntries.length / pageSize);
        let cardPage = 0;

        const generateCardPage = (page) => {
          const pageCards = cardEntries.slice(page * pageSize, (page + 1) * pageSize);
          const embed = new EmbedBuilder()
            .setTitle(`${actionMode === 'give' ? '🟢 GIVE' : '🔴 TAKE'} a Card`)
            .setDescription(`Select a card for **${targetName}**\nPage ${page + 1} of ${cardPages}`);

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_card_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('next_card_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === cardPages - 1)
          );

          const dropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('duelcard_card_select')
              .setPlaceholder('Select a card')
              .addOptions(pageCards)
          );

          return { embed, buttons, dropdown };
        };

        const updateCardPage = async () => {
          const { embed, buttons, dropdown } = generateCardPage(cardPage);
          await cardMsg.edit({ embeds: [embed], components: [dropdown, buttons] });
        };

        const { embed, buttons, dropdown } = generateCardPage(cardPage);
        const cardMsg = await interaction.followUp({ embeds: [embed], components: [dropdown, buttons], ephemeral: true, fetchReply: true });

        const cardCollector = cardMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
        cardCollector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) return;
          if (i.customId === 'prev_card_page') cardPage--;
          if (i.customId === 'next_card_page') cardPage++;
          await i.deferUpdate();
          await updateCardPage();
        });

        const cardSelectCollector = cardMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000 });
        cardSelectCollector.on('collect', async cardSelect => {
          if (cardSelect.user.id !== interaction.user.id || !cardSelect.customId.includes('duelcard_card_select')) return;

          const cardId = cardSelect.values[0];
          const player = linkedData[targetId];
          const collection = player.collection || {};

          if (actionMode === 'give') {
            collection[cardId] = (collection[cardId] || 0) + 1;
          } else {
            if (!collection[cardId]) {
              return cardSelect.reply({ content: '⚠️ That player doesn’t own this card.', ephemeral: true });
            }
            collection[cardId]--;
            if (collection[cardId] <= 0) delete collection[cardId];
          }

          linkedData[targetId].collection = collection;
          await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));
          console.log(`[${timestamp}] ✅ ${actionMode.toUpperCase()} ${cardId} ${actionMode === 'give' ? 'to' : 'from'} ${targetName}`);

          return cardSelect.reply({
            content: `✅ Card **${cardId}** ${actionMode === 'give' ? 'given to' : 'taken from'} **${targetName}**.`,
            ephemeral: false
          });
        });
      });
    }
  });
}
