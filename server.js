import express from 'express';
import cors from 'cors';
import duelRoutes from './routes/duel.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/bot', duelRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Duel Bot Backend running on port ${PORT}`);
});
