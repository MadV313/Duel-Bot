// routes/status.js

import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';

const router = express.Router();

// Optional: load version from package.json
let version = 'unknown';
try {
  const pkg = JSON.parse(readFileSync(path.resolve('./package.json')));
  version = pkg.version || version;
} catch (err) {
  console.warn('Could not read package.json for version info.');
}

router.get('/status', (req, res) => {
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = new Date(uptimeSeconds * 1000).toISOString().substr(11, 8); // HH:MM:SS

  res.json({
    status: 'online',
    server: 'SV13 Duel Bot',
    version,
    uptime: uptimeFormatted,
    timestamp: new Date().toISOString()
  });
});

export default router;
