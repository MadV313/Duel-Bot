// cogs/unlinkdeck.js

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType
} from 'discord.js';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';
const linkedDecksPath = path.resolve('./data/linked_decks.json');

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
      } catch (err) {
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

      // Construct dropdown options
      const options = entries.map(([id, data]) => ({
        label: data.discordName,
        value: id
      })).slice(0, 25); // Discord max: 25 options

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_unlink_user')
          .setPlaceholder('🔻 Choose a user to unlink')
          .addOptions(options)
      );

      await interaction.reply({
        content: '📋 Select the user you want to unlink:',
        components: [row],
        ephemeral: true
      });

      const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 30000,
        max: 1
      });

      collector.on('collect', async selectInteraction => {
        if (selectInteraction.customId !== 'select_unlink_user') return;

        const selectedId = selectInteraction.values[0];
        const removedUser = linkedData[selectedId]?.discordName || 'Unknown';

        delete linkedData[selectedId];
        await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));
        console.log(`🗑️ [unlinkdeck] Unlinked ${removedUser} (${selectedId})`);

        await selectInteraction.update({
          content: `✅ Successfully unlinked **${removedUser}**.`,
          components: []
        });
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({
            content: '⏰ No selection made. Command cancelled.',
            components: []
          });
        }
      });
    }
  });
}
