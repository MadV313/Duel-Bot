// cogs/unlinkdeck.js

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ComponentType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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

      // Display current linked users first
      const userList = entries
        .map(([id, data], i) => `\`${i + 1}.\` **${data.discordName}** — \`ID: ${id}\``)
        .join('\n');

      await interaction.reply({
        content: `📋 **Currently Linked Users**:\n\n${userList}`,
        ephemeral: true
      });

      // Follow-up prompt
      const filter = msg =>
        msg.author.id === interaction.user.id &&
        msg.channel.id === interaction.channelId;

      interaction.followUp({
        content: '✏️ Please type **the exact username** of the player you’d like to unlink:',
        ephemeral: true
      });

      try {
        const collected = await interaction.channel.awaitMessages({
          filter,
          max: 1,
          time: 30000,
          errors: ['time']
        });

        const typedName = collected.first().content.trim();
        const matchEntry = Object.entries(linkedData).find(
          ([_, data]) => data.discordName === typedName
        );

        if (!matchEntry) {
          return interaction.followUp({
            content: `❌ No linked user found with name: **${typedName}**`,
            ephemeral: true
          });
        }

        const [matchedId, matchedData] = matchEntry;
        delete linkedData[matchedId];

        await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));
        console.log(`🗑️ [unlinkdeck] Unlinked ${typedName} (${matchedId})`);

        return interaction.followUp({
          content: `✅ Successfully unlinked **${typedName}**.`,
          ephemeral: true
        });
      } catch (err) {
        console.warn('⏱️ [unlinkdeck] No admin input received.');
        return interaction.followUp({
          content: '⏰ No response received. Command cancelled.',
          ephemeral: true
        });
      }
    }
  });
}
