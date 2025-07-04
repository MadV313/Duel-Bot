// server.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import registerCommands from './registerCommands.js';

// ✅ Routes
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js';
import userStatsRoutes from './routes/userStats.js';
import cardRoutes from './routes/packReveal.js';
import collectionRoute from './routes/collection.js'; // ✅ NEW

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ One-time Slash Command Registration
const flagPath = './.commands_registered';
if (!fs.existsSync(flagPath)) {
  console.log('🔁 Registering slash commands...');
  registerCommands().then(() => {
    fs.writeFileSync(flagPath, 'done');
    console.log('✅ Commands registered once on boot.');
  }).catch(err => {
    console.error('❌ Command registration failed:', err);
  });
} else {
  console.log('ℹ️ Commands already registered — skipping.');
}

// ✅ Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// ✅ API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: '🚫 Too many requests. Please try again later.'
});
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);

// ✅ Routes
app.use('/bot', duelRoutes);
app.use('/duel', duelStartRoutes);
app.use('/duel/live', liveRoutes);
app.use('/summary', summaryRoutes);
app.use('/user', userStatsRoutes);
app.use('/packReveal', cardRoutes);
app.use('/collection', collectionRoute);
app.use('/', statusRoutes);

// ✅ Default Home Route
app.get('/', (req, res) => {
  res.send('🌐 Duel Bot Backend is live.');
});

// ✅ Error Handlers
app.use((req, res, next) => {
  res.status(404).json({ error: '🚫 Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT}`);
});
