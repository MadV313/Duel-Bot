import express from 'express';
import cors from 'cors';
import duelRoutes from './routes/duel.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Primary duel routes
app.use('/bot', duelRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send('Duel Bot Backend is live.');
});

// Status check route
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime().toFixed(2) + 's',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Duel Bot Backend running on port ${PORT}`);
});
