// cogs/viewlinked.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';
const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default async function registerViewLinked(client) {
  const commandData = new SlashCommandBuilder()
    .setName('viewlinked')
    .setDescription('Admin only: View all currently linked users.')
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

      try {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        const linkedData = JSON.parse(raw);

        const entries = Object.entries(linkedData);
        if (entries.length === 0) {
          return interaction.reply({
            content: '⚠️ No users have linked profiles yet.',
            ephemeral: true
          });
        }

        const list = entries.map(([userId, data], index) =>
          `\`${index + 1}.\` **${data.discordName}** — \`ID: ${userId}\``
        ).join('\n');

        return interaction.reply({
          content: `📋 **Linked Users** (${entries.length} total):\n\n${list}`,
          ephemeral: true
        });
      } catch (err) {
        console.error('❌ [viewlinked] Failed to read linked_decks.json:', err);
        return interaction.reply({
          content: '❌ Failed to load linked users. Please check the logs.',
          ephemeral: true
        });
      }
    }
  });
}
