// commands/rules.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View the full SV13 CCG rulebook and combo reference'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards', 'manageDeck', 'battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in a duel bot channel.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `**SV13 CCG Rulebook & Guide**\n
View the complete rulebook, commands, and combo list below:
**[Open Rulebook](https://your-github-pages-url.com/rulebook.html)**\n
Includes:
• Game Setup & Deck Rules  
• All Bot Commands  
• Card Types & Effects  
• Duel Mechanics  
• All 10 Synergy Combos  
• Admin Tools  
• Practice Rules & Spectator Mode`,
      ephemeral: true
    });
  }
};
