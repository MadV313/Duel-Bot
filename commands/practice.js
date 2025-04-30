// commands/practice.js

import { startPracticeDuel } from '../logic/duelState.js';

export default {
  name: 'practice',
  description: 'Start a practice duel vs the bot (admin-only)',
  execute(interaction) {
    // Admin check (you can expand this with a role check if needed)
    const isAdmin = interaction.member.permissions.has('Administrator');
    if (!isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    startPracticeDuel(); // Launch bot duel
    return interaction.reply({ content: 'Practice duel started! Load the UI to play.', ephemeral: true });
  },
};
