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
    // ✅ Enforce correct channel usage
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;

    let coinBank = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        const raw = fs.readFileSync(coinBankPath, 'utf-8');
        coinBank = JSON.parse(raw);
      }
    } catch (err) {
      console.error('❌ Failed to read coin bank:', err);
      return interaction.reply({
        content: '❌ Error retrieving your balance.',
        ephemeral: true
      });
    }

    const balance = coinBank[userId] || 0;

    return interaction.reply({
      content: `💰 You currently have **${balance} coin${balance !== 1 ? 's' : ''}**.`,
      ephemeral: true
    });
  }
};
