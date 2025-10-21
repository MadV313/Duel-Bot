// routes/duelUiCompat.js
import express from 'express';

const router = express.Router();

// Helper to read token from header or query
function getToken(req) {
  return (req.headers['x-player-token'] || req.query.token || '').toString().trim();
}

/**
 * UI health/ready probe
 * GET /duel/state?mode=practice&token=...
 * (UI expects 200 if server is alive)
 */
router.get('/duel/state', async (req, res) => {
  const mode  = (req.query.mode || req.headers['x-mode'] || 'practice').toString();
  const token = getToken(req);
  if (!token) return res.status(400).json({ ok:false, error:'Missing token' });

  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, mode, ready: true });
});

/**
 * Practice start shim
 * POST /bot/practice
 * – Delegates to your unified /duel/start with practice settings
 */
router.post('/bot/practice', async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(400).json({ ok:false, error:'Missing token' });

    // Build the body expected by your unified start route
    req.url = '/duel/start';              // rewrite path internally
    req.method = 'POST';
    req.body = {
      players: [{ token }],
      settings: {
        mode: 'practice',
        bot: true,
        wagerCoins: 0,
        allowSteal: false
      }
    };

    // Hand off to the /duel/start stack
    return next();
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
});

export default router;
