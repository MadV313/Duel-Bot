imimport express from 'express';
import { weightedRandomCards } from '../utils/cardPicker.js';  // This is your existing logic

const router = express.Router();

// Route to get a random pack of cards
router.get('/revealPack', (req, res) => {
  try {
    // Fetch 3 random cards using your existing weighted random logic from cardPicker.js
    const cards = weightedRandomCards(3);

    // Return the fetched cards in response
    res.json(cards);
  } catch (error) {
    console.error('Error fetching random cards:', error);
    res.status(500).send('Failed to fetch cards.');
  }
});

export default router;
