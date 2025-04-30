import express from 'express';
import cors from 'cors';
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js'; // <- NEW

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/bot', duelRoutes);
app.use('/duel', duelStartRoutes);
app.use('/duel/live', liveRoutes); // <- NEW: live duel + spectator count
app.use('/summary', summaryRoutes);
app.use('/', statusRoutes);

app.get('/', (req, res) => {
  res.send('Duel Bot Backend is live.');
});

app.listen(PORT, () => {
  console.log(`Duel Bot Backend running on port ${PORT}`);
});
