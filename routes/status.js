// routes/status.js

import express from 'express';
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime().toFixed(2) + 's',
    timestamp: new Date().toISOString()
  });
});

export default router;
