// routes/reveal.js

import express from 'express';
import { load_file } from '../utils/storageClient.js';

const router = express.Router();

router.get('/:uid.json', async (req, res) => {
  const userId = req.params.uid;
  const key = `public/data/reveal_${userId}.json`;

  try {
    const raw = await load_file(key);
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error(`❌ Could not load reveal for UID ${userId}:`, err?.message || err);
    res.status(404).json({ error: 'Card pack not found.' });
  }
});

export default router;
