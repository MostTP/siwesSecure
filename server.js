import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import locationRoutes from './routes/locations.js';
import presenceRoutes from './routes/presence.js';
import logbookRoutes from './routes/logbook.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/logbook', logbookRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIWESecure API' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

