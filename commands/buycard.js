import fs from 'fs';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js';

const coinBankPath = path.resolve('./data/coin_bank.json');
const linkedDecksPath = path.resolve('./data/linked_decks.json');
const PACK_COST = 3;
const PACK_SIZE = 3;

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
      return interaction.reply({ content: '⚠️ Internal error occurred.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    if (balance < PACK_COST) {
      return interaction.reply({ content: '❌ You need 3 coins to buy a card pack.', ephemeral: true });
    }

    // Draw weighted cards
    const newCards = weightedRandomCards(PACK_SIZE);

    // Add to user deck
    const userDeck = decks[userId]?.deck || [];
    userDeck.push(...newCards);
    decks[userId] = {
      discordName: interaction.user.username,
      deck: userDeck
    };

    // Deduct coins
    coinBank[userId] = balance - PACK_COST;

    try {
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
      fs.writeFileSync(linkedDecksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('Failed to write updates:', err);
      return interaction.reply({ content: '❌ Purchase failed. Please try again.', ephemeral: true });
    }

    // Response message (can be replaced by animated UI later)
    return interaction.reply({
      content: `✅ You bought a pack! \nCards pulled: \`${newCards.join(', ')}\`\n(3 coins deducted)`,
      ephemeral: true
    });
  }
};
