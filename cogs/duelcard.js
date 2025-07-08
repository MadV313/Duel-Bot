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
const imageBasePath = 'https://madv313.github.io/images/cards'; // Adjust path if local or hosted elsewhere

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

      try {
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

        const modeRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('duelcard_mode')
            .setPlaceholder('🃏 Choose action')
            .addOptions([
              { label: 'Give Card', value: 'give' },
              { label: 'Take Card', value: 'take' }
            ])
        );

        await interaction.reply({
          content: '🃏 Select whether to give or take a card:',
          components: [modeRow],
          ephemeral: true
        });

        const modeSelect = await interaction.channel.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 30_000
        });

        try {
          await modeSelect.deferUpdate();
        } catch (err) {
          console.warn('⚠️ Mode select interaction expired or failed:', err);
          return;
        }

        const actionMode = modeSelect.values[0];
        await interaction.editReply({ content: '✅ Mode selected. Loading players...', components: [] });

        let linkedData = {};
        try {
          const raw = await fs.readFile(linkedDecksPath, 'utf-8');
          linkedData = JSON.parse(raw);
        } catch {
          return interaction.editReply({ content: '⚠️ Could not load linked users.' });
        }

        const entries = Object.entries(linkedData);
        if (entries.length === 0) {
          return interaction.editReply({ content: '⚠️ No linked profiles found.' });
        }

        const pageSize = 25;
        let userPage = 0;
        const userPages = Math.ceil(entries.length / pageSize);

        const generateUserPage = (page) => {
          const slice = entries.slice(page * pageSize, (page + 1) * pageSize);
          const options = slice.map(([id, data]) => ({ label: data.discordName, value: id }));

          const embed = new EmbedBuilder()
            .setTitle(`👤 Select Target Player`)
            .setDescription(`Page ${page + 1} of ${userPages}`);

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_user_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('next_user_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === userPages - 1)
          );

          const dropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('duelcard_user_select')
              .setPlaceholder('Select a player')
              .addOptions(options)
          );

          return { embed, buttons, dropdown };
        };

        const updateUserPage = async () => {
          const { embed, buttons, dropdown } = generateUserPage(userPage);
          await interaction.editReply({ embeds: [embed], components: [dropdown, buttons] });
        };

        await updateUserPage();

        const userCollector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
        const userSelectCollector = interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60_000
        });

        userCollector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) return;
          await i.deferUpdate();
          if (i.customId === 'prev_user_page') userPage--;
          if (i.customId === 'next_user_page') userPage++;
          await updateUserPage();
        });

        userSelectCollector.on('collect', async select => {
          if (select.user.id !== interaction.user.id || !select.customId.includes('duelcard_user_select')) return;
          userCollector.stop();
          userSelectCollector.stop();

          await select.deferUpdate();

          const targetId = select.values[0];
          const targetName = linkedData[targetId]?.discordName || 'Unknown';

          console.log(`[${timestamp}] 🎯 ${executor} selected ${targetName} (${targetId})`);

          let cardData = [];
          try {
            const raw = await fs.readFile(cardListPath, 'utf-8');
            cardData = JSON.parse(raw);
          } catch {
            return interaction.editReply({ content: '⚠️ Could not load card data.' });
          }

          let filteredCards = cardData.filter(card => card.card_id !== '000');

          if (actionMode === 'take') {
            const owned = linkedData[targetId].collection || {};
            filteredCards = filteredCards.filter(card => owned[card.card_id]);
          }

          const cardOptions = filteredCards.map(card => ({
            label: `${card.card_id} ${card.name}`.slice(0, 100),
            value: String(card.card_id)
          }));

          if (actionMode === 'give') {
            cardOptions.unshift({ label: '🎲 Random Card', value: 'RANDOM_CARD' });
          }

          const cardPageSize = 25;
          let cardPage = 0;
          const cardPages = Math.ceil(cardOptions.length / cardPageSize);

          const generateCardPage = (page) => {
            const pageSlice = cardOptions.slice(page * cardPageSize, (page + 1) * cardPageSize);
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
                .addOptions(pageSlice)
            );

            return { embed, buttons, dropdown };
          };

          const { embed, buttons, dropdown } = generateCardPage(cardPage);
          const cardMsg = await interaction.editReply({
            embeds: [embed],
            components: [dropdown, buttons],
            fetchReply: true
          });

          const cardCollector = cardMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
            filter: i => i.message.id === cardMsg.id && i.user.id === interaction.user.id
          });

          cardCollector.on('collect', async btn => {
            if (btn.customId === 'prev_card_page') cardPage--;
            if (btn.customId === 'next_card_page') cardPage++;

            const { embed, buttons, dropdown } = generateCardPage(cardPage);
            try {
              await btn.update({ embeds: [embed], components: [dropdown, buttons] });
            } catch (err) {
              console.warn('⚠️ Failed to update card page:', err);
              try {
                await cardMsg.edit({ embeds: [embed], components: [dropdown, buttons] });
              } catch (editErr) {
                console.error('❌ Could not fallback-edit cardMsg:', editErr);
              }
            }
          });

          const selectCollector = cardMsg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: i => i.message.id === cardMsg.id && i.user.id === interaction.user.id
          });

          selectCollector.on('collect', async cardSelect => {
            let cardId = cardSelect.values[0];

            if (cardId === 'RANDOM_CARD') {
              const random = filteredCards[Math.floor(Math.random() * filteredCards.length)];
              cardId = random.card_id;
            }

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

            const verb = actionMode === 'give' ? 'given to' : 'taken from';
            const adminTag = `<@${interaction.user.id}>`;
            const targetTag = `<@${targetId}>`;
            const selectedCard = cardData.find(c => c.card_id === cardId);

            const embed = new EmbedBuilder()
              .setTitle(`✅ Card ${verb}`)
              .setDescription(`Card **${cardId} ${selectedCard?.name || ''}** ${verb} ${targetTag} by ${adminTag}.`)
              .setImage(`https://raw.githubusercontent.com/MadV313/Duel-Bot/main/images/cards/${cardId}_${selectedCard?.name?.replace(/[^a-zA-Z0-9]/g, '')}_${selectedCard?.type}.png`)
              .setColor(actionMode === 'give' ? 0x00cc66 : 0xcc0000);

            return interaction.followUp({ embeds: [embed], ephemeral: false });
          });
        });
      } catch (err) {
        console.error(`❌ Fatal error in /duelcard:`, err);
        if (!interaction.replied) {
          return interaction.reply({ content: '❌ Something went wrong in /duelcard.', ephemeral: true });
        }
        return interaction.editReply({ content: '❌ Something went wrong after interaction started.', ephemeral: true });
      }
    }
  });
}
