import express from 'express';
import { duelState } from '../logic/duelState.js';

const router = express.Router();

// Returns live duel state including spectator count
router.get('/current', (req, res) => {
  if (!duelState.players.player1 || !duelState.players.player2) {
    return res.status(404).json({ error: 'No duel in progress.' });
  }

  res.status(200).json({
    players: duelState.players, // Consider filtering hands for spectators
    currentPlayer: duelState.currentPlayer,
    winner: duelState.winner,
    spectatorCount: duelState.spectators.length,
    wager: duelState.wagerAmount || 0
  });
});

export default router;
