import express from 'express';
import { applyBotMove } from '../logic/botHandler.js';

const router = express.Router();

router.post('/turn', async (req, res) => {
  const duelState = req.body;

  try {
    const updatedState = await applyBotMove(duelState);
    res.json(updatedState);
  } catch (err) {
    res.status(500).json({ error: 'Bot move failed', details: err.message });
  }
});

export default router;
