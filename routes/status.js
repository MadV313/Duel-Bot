// routes/status.js

import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';

const router = express.Router();

// Attempt to read version from package.json
let version = 'unknown';
try {
  const pkgPath = path.resolve('./package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  version = pkg.version || version;
} catch (err) {
  console.warn('⚠️ Could not read package.json for version info:', err.message);
}

router.get('/status', (req, res) => {
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = new Date(uptimeSeconds * 1000).toISOString().substr(11, 8); // HH:MM:SS

  res.status(200).json({
    status: 'online',
    server: 'SV13 Duel Bot',
    version,
    uptime: uptimeFormatted,
    timestamp: new Date().toISOString()
  });
});

export default router;
