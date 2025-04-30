// commands/practice.js

import { startPracticeDuel } from '../logic/duelState.js';

export default {
  name: 'practice',
  description: 'Start a practice duel vs the bot (admin-only)',
  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has('Administrator');

    if (!isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    startPracticeDuel(); // Launch the duel state in memory

    return interaction.reply({
      content: 'Practice duel started! Load the duel UI to begin.',
      ephemeral: true
    });
  }
};
