import { SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';

export const data = new SlashCommandBuilder()
  .setName('practice')
  .setDescription('Start a practice duel against the bot (admin only)');

export async function execute(interaction) {
  const allowedChannels = ['1367986446232719484']; // #battlefield
  const adminRoles = ['1173049392371085392', '1184921037830373468'];
  const memberRoles = interaction.member.roles.cache.map(role => role.id);
  const isAdmin = adminRoles.some(role => memberRoles.includes(roleId));

  if (!isAdmin) {
    return interaction.reply({
      content: 'Only admins can start a practice duel.',
      ephemeral: true
    });
  }

  try {
    await interaction.reply('Launching practice duel...');

    const res = await fetch('http://localhost:3000/duel/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1Id: interaction.user.id,
        player2Id: 'bot'
      })
    });

    const result = await res.json();
    if (res.ok) {
      await interaction.editReply('Practice duel started successfully!');
    } else {
      await interaction.editReply(`Failed to start practice duel: ${result.error}`);
    }
  } catch (err) {
    console.error('Practice duel error:', err);
    await interaction.editReply('An error occurred while starting the practice duel.');
  }
}
