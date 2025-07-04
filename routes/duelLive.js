import express from 'express';
import { duelState } from '../logic/duelState.js';

const router = express.Router();

/**
 * GET /current
 * Returns the current duel state including:
 * - players (optionally redacted hands)
 * - currentPlayer
 * - winner
 * - spectatorCount
 * - wager
 *
 * Optional: ?safeView=true will redact all card hands
 */
router.get('/current', (req, res) => {
  const { players, currentPlayer, winner, spectators, wagerAmount } = duelState;

  const player1 = { ...players.player1 };
  const player2 = players.player2 ? { ...players.player2 } : { ...players.bot };

  if (!player1 || !player2) {
    return res.status(404).json({ error: 'No duel in progress.' });
  }

  // Handle safe view mode (hide hand card IDs)
  if (req.query.safeView === 'true') {
    player1.hand = player1.hand.map(() => ({ cardId: '000', isFaceDown: true }));
    player2.hand = player2.hand.map(() => ({ cardId: '000', isFaceDown: true }));
  }

  res.status(200).json({
    players: {
      player1,
      player2
    },
    currentPlayer,
    winner,
    spectatorCount: spectators.length,
    wager: wagerAmount || 0
  });
});

export default router;
