import express from 'express';
import cors from 'cors';
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js'; // NEW LINE

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Route registrations
app.use('/bot', duelRoutes);
app.use('/', statusRoutes); // NEW LINE

// Root health text
app.get('/', (req, res) => {
  res.send('Duel Bot Backend is live.');
});

// Start server
app.listen(PORT, () => {
  console.log(`Duel Bot Backend running on port ${PORT}`);
});
