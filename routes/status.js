// routes/status.js

import express from 'express';
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Duel Bot Backend is healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default router;
