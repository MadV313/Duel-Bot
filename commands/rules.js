// commands/rules.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

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
**[Open RuleBook](${config.ui_urls.rulebook_url})**  
  
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
