// routes/chatHistory.js
import express from 'express';
import { getHistory } from '../logic/chatRegistry.js';

const router = express.Router();

router.get('/:room/history', (req, res) => {
  const room = (req.params.room || '').toString();
  if (!room) return res.status(400).json({ error: 'room required' });
  res.json({ ok: true, room, messages: getHistory(room) });
});

export default router;
