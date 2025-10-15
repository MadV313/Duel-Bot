// cogs/unlinkdeck.js — Paginated version synced with dropdown
// Updates:
// • Keeps existing UX/logic intact
// • Also cleans up any tokenized Pack Reveal JSON for the user (userId + token variants)
// • Extra logging + safe error handling around file I/O

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

const linkedDecksPath  = path.resolve('./data/linked_decks.json');
const coinBankPath     = path.resolve('./data/coin_bank.json');
const playerDataPath   = path.resolve('./data/player_data.json');
const revealOutputDir  = path.resolve('./public/data'); // where cardpack writes reveal_<id>.json

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

      let linkedData = {};
      try {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        linkedData = JSON.parse(raw);
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
        time: 60000
      });

      const dropdownCollector = mainReply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });

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
        const removedUser = linkedData[selectedId]?.discordName || 'Unknown';
        const removedToken = linkedData[selectedId]?.token || '';

        // Remove from linked_decks.json
        delete linkedData[selectedId];
        await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));

        // Remove from coin_bank.json
        try {
          const raw = await fs.readFile(coinBankPath, 'utf-8');
          const coinData = JSON.parse(raw);
          delete coinData[selectedId];
          await fs.writeFile(coinBankPath, JSON.stringify(coinData, null, 2));
          console.log(`💰 [unlinkdeck] Removed coin data for ${selectedId}`);
        } catch {
          console.warn('⚠️ [unlinkdeck] Failed to update coin_bank.json (may not exist).');
        }

        // Remove from player_data.json
        try {
          const raw = await fs.readFile(playerDataPath, 'utf-8');
          const playerData = JSON.parse(raw);
          delete playerData[selectedId];
          await fs.writeFile(playerDataPath, JSON.stringify(playerData, null, 2));
          console.log(`📊 [unlinkdeck] Removed player data for ${selectedId}`);
        } catch {
          console.warn('⚠️ [unlinkdeck] Failed to update player_data.json (may not exist).');
        }

        // Clean up any Pack Reveal JSON files for this user (user + token variants)
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

        await selectInteraction.update({
          content: `✅ Successfully unlinked **${removedUser}**.`,
          embeds: [],
          components: []
        });

        collector.stop();
        dropdownCollector.stop();
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
