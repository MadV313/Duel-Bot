// commands/rules.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

export default {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View the SV13 RuleBook and combo reference'),

  async execute(interaction) {
    // ✅ Restrict to bot channels only
    if (!isAllowedChannel(interaction.channelId, ['manageCards', 'manageDeck', 'battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in a duel bot channel.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `**📘 SV13 RuleBook**  
Access the complete guide, command list, and synergy combos here:  
🔗 **[Open RuleBook](${config.ui_urls.rulebook_url})**

__**Contents Include:**__  
• ✅ How to Link Your Deck  
• 🧪 Game Setup & Turn Structure  
• 📜 Full Command Reference  
• 🧠 Card Types & Special Effects  
• 🎯 Combat & Duel Flow  
• 🔥 10 Verified Synergy Combos  
• 👁 Practice & Spectator Modes`,
      ephemeral: true
    });
  }
};
