import { SlashCommandBuilder } from 'discord.js';
import checkChannel from '../utils/checkChannel.js';

export const data = new SlashCommandBuilder()
  .setName('practice')
  .setDescription('Start a practice duel against the bot (admin only)');

export async function execute(interaction) {
  const allowedChannels = ['1367986446232719484']; // #battlefield

  // Channel restriction
  if (!checkChannel(interaction, allowedChannels)) return;

  // Optional admin-only restriction
  const adminRoles = ['1173049392371085392']; // Admin role
  const trialAdminRoles = ['1184921037830373468']; // Trial Admin role

  const memberRoles = interaction.member.roles.cache.map(role => role.id);
  const hasAccess = [...adminRoles, ...trialAdminRoles].some(roleId =>
    memberRoles.includes(roleId)
  );

  if (!hasAccess) {
    return interaction.reply({
      content: 'Only admins can start a practice duel.',
      ephemeral: true
    });
  }

  // Trigger duel backend logic (already wired for practice mode)
  try {
    await interaction.reply('Launching practice duel...');

    // You may trigger your backend or practice duel logic here
    // Example: call a webhook or internal function to launch duel

  } catch (err) {
    console.error('Error starting practice duel:', err);
    interaction.editReply('An error occurred while launching the practice duel.');
  }
}
