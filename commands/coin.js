import fs from 'fs';
import path from 'path';

const coinBankPath = path.resolve('./data/coin_bank.json');

export default {
  name: 'coin',
  description: 'Check your current coin balance.',
  async execute(interaction) {
    const userId = interaction.user.id;

    let coinBank = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
    } catch (err) {
      console.error('Failed to read coin bank:', err);
    }

    const balance = coinBank[userId] || 0;
    return interaction.reply({ content: `You have ${balance} coins.`, ephemeral: true });
  },
};
