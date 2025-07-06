// cogs/viewlinked.js — Paginated with synced dropdown and profile viewer

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
const coinBankPath = path.resolve('./data/coin_bank.json');
const playerDataPath = path.resolve('./data/player_data.json');

export default async function registerViewLinked(client) {
  const commandData = new SlashCommandBuilder()
    .setName('viewlinked')
    .setDescription('Admin only: View all currently linked users and inspect profiles.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('viewlinked', {
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

      const entries = Object.entries(linkedData);
      if (entries.length === 0) {
        return interaction.reply({
          content: '⚠️ No linked profiles found.',
          ephemeral: true
        });
      }

      const pageSize = 25;
      let currentPage = 0;
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

      const { embed, row, buttons } = generatePageData(currentPage);

      const reply = await interaction.reply({
        embeds: [embed],
        components: [row, buttons],
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
        const profile = linkedData[selectedId];
      
        let coin = 0;
        let wins = 0;
        let losses = 0;
      
        try {
          const coinData = JSON.parse(await fs.readFile(coinBankPath, 'utf-8'));
          coin = coinData[selectedId] ?? 0;
        } catch {}
      
        try {
          const statsData = JSON.parse(await fs.readFile(playerDataPath, 'utf-8'));
          if (statsData[selectedId]) {
            wins = statsData[selectedId].wins ?? 0;
            losses = statsData[selectedId].losses ?? 0;
          }
        } catch {}
      
        // 🔢 Count total unlocked card IDs from 001–127
        const ownedIds = Object.keys(profile.collection || {});
        const uniqueUnlocked = ownedIds.filter(id => {
          const parsed = parseInt(id, 10);
          return parsed >= 1 && parsed <= 127;
        }).length;
      
        const profileEmbed = new EmbedBuilder()
          .setTitle(`<:ID:1391239596112613376> Profile: ${profile.discordName}`)
          .addFields(
            { name: '🂠 Deck Size', value: `${profile.deck.length}`, inline: true },
            { name: '🀢🀣🀦🀤 Collection Size', value: `${Object.values(profile.collection).reduce((a, b) => a + b, 0)}`, inline: true },
            { name: '🀢ᯓ★ Cards Unlocked', value: `${uniqueUnlocked} / 127`, inline: true },
            { name: '⛃ Coins', value: `${coin}`, inline: true },
            { name: '╰── ──╮ Wins / Losses', value: `${wins} / ${losses}`, inline: true }
          )
          .setFooter({ text: `Discord ID: ${selectedId}` });
      
        await selectInteraction.reply({
          embeds: [profileEmbed],
          ephemeral: true
        });
      }); // ✅ properly closes dropdownCollector.on('collect', ...)

      dropdownCollector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: '⏰ No selection made. Command expired.',
            embeds: [],
            components: []
          });
        }
      });
    }
  });
}
