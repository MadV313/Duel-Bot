// commands/practice.js

import { startPracticeDuel } from '../logic/duelState.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

export default {
  name: 'practice',
  description: 'Start a practice duel vs the bot (admin-only)',

  execute(interaction) {
    // Restrict to #battlefield
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    // Admin check
    const isAdmin = interaction.member.permissions.has('Administrator');
    if (!isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    startPracticeDuel(); // Launch bot duel
    return interaction.reply({ content: 'Practice duel started! Load the UI to play.', ephemeral: true });
  },
};
