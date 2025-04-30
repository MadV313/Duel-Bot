// commands/challenge.js

import { SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a duel')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('Select the player to challenge')
        .setRequired(true)
    ),

  async execute(interaction) {
    const challengerId = interaction.user.id;
    const opponent = interaction.options.getUser('opponent');
    const opponentId = opponent.id;

    // POST to duel backend
    try {
      const response = await fetch('https://duel-bot-backend-production.up.railway.app/duel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1Id: challengerId, player2Id: opponentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unknown error');
      }

      // Return link to Duel UI (frontend URL can be customized)
      return interaction.reply({
        content: `Duel initialized! [Click here to duel](https://your-frontend-ui-link.com?player1=${challengerId}&player2=${opponentId})`,
        ephemeral: true
      });
    } catch (err) {
      console.error('Challenge failed:', err);
      return interaction.reply({
        content: 'Failed to start duel. Make sure both players have linked decks.',
        ephemeral: true
      });
    }
  }
};
