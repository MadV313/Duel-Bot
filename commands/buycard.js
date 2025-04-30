import fs from 'fs';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js'; // util with rarity weights

const coinBankPath = path.resolve('./data/coin_bank.json');
const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  name: 'buycard',
  description: 'Buy a card pack (3 random cards for 3 coins)',
  async execute(interaction) {
    const userId = interaction.user.id;

    let coinBank = {};
    let decks = {};

    try {
      coinBank = fs.existsSync(coinBankPath)
        ? JSON.parse(fs.readFileSync(coinBankPath))
        : {};
      decks = fs.existsSync(linkedDecksPath)
        ? JSON.parse(fs.readFileSync(linkedDecksPath))
        : {};
    } catch (err) {
      console.error('Failed to load coin bank or decks:', err);
      return interaction.reply({ content: 'Internal error occurred.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    if (balance < 3) {
      return interaction.reply({ content: 'You need 3 coins to buy a card pack.', ephemeral: true });
    }

    // Pull 3 cards
    const newCards = weightedRandomCards(3); // returns array of cardIds
    const userDeck = decks[userId]?.deck || [];

    // Add cards to user
    newCards.forEach(card => userDeck.push(card));
    decks[userId] = {
      discordName: interaction.user.username,
      deck: userDeck
    };

    // Deduct coins
    coinBank[userId] = balance - 3;

    // Save changes
    try {
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
      fs.writeFileSync(linkedDecksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('Failed to save updates:', err);
      return interaction.reply({ content: 'Purchase failed. Try again.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ You bought a pack and received: ${newCards.join(', ')}`,
      ephemeral: true
    });
  }
};
