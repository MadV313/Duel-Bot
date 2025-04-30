import express from 'express';
import cors from 'cors';
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js'; // <- NEW

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/bot', duelRoutes);
app.use('/duel', duelStartRoutes); // <- NEW
app.use('/', statusRoutes);

app.get('/', (req, res) => {
  res.send('Duel Bot Backend is live.');
});

app.listen(PORT, () => {
  console.log(`Duel Bot Backend running on port ${PORT}`);
});
