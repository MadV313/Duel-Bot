// commands/coin.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const coinBankPath = path.resolve('./data/coin_bank.json');

export default {
  data: new SlashCommandBuilder()
    .setName('coin')
    .setDescription('Check your current coin balance.'),

  async execute(interaction) {
    // Restrict to #manage-cards channel
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;

    let coinBank = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
    } catch (err) {
      console.error('Failed to read coin bank:', err);
      return interaction.reply({ content: 'Error retrieving balance.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    return interaction.reply({
      content: `You have ${balance} coins.`,
      ephemeral: true
    });
  }
};
