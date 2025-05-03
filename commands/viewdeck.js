// commands/viewdeck.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

export default {
  data: new SlashCommandBuilder()
    .setName('viewdeck')
    .setDescription('View your current deck in the Deck Builder UI'),

  async execute(interaction) {
    // Restrict to #manage-cards
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const url = `https://your-username.github.io/Deck-Builder-UI/?user=${userId}`;

    return interaction.reply({
      content: `Here’s your current deck: [Open Deck Builder](${url})`,
      ephemeral: true
    });
  }
};
