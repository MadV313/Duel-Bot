// commands/rules.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View the SV13 RuleBook and combo reference'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards', 'manageDeck', 'battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in a duel bot channel.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `**SV13 RuleBook**  
Access the complete guide, commands, and synergy combos here:  
**[Open RuleBook](https://madv313.github.io/Duel-Bot/sv13_rulebook_final_gritty.html)**  
  
**Contents Include:**  
• Deck Linking (start here)  
• Game Setup & Rules  
• Full Bot Command List  
• Card Types & Effects  
• Duel Mechanics & Turn Flow  
• 10 Verified Synergy Combos  
• Practice Rules & Spectator Mode`,
      ephemeral: true
    });
  }
};
