// routes/reveal.js

import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();
const revealDataDir = path.resolve('./public/data');

router.get('/:uid.json', async (req, res) => {
  const userId = req.params.uid;
  const filePath = path.join(revealDataDir, `reveal_${userId}.json`);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error(`❌ Could not load reveal for UID ${userId}:`, err.message);
    res.status(404).json({ error: 'Card pack not found.' });
  }
});

export default router;
