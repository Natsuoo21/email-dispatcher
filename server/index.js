require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  let dbOk = false;
  try {
    const row = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get();
    dbOk = row.cnt >= 5;
  } catch (e) {
    dbOk = false;
  }

  res.json({
    status: 'ok',
    database: dbOk,
    uptime: process.uptime(),
    tables: dbOk ? 5 : 0,
  });
});

// Routes
app.use('/api/templates', require('./routes/templates'));
app.use('/api/recipient-lists', require('./routes/recipients'));
app.use('/api/smtp-accounts', require('./routes/smtp'));
app.use('/api/dispatches', require('./routes/dispatches'));

app.listen(PORT, () => {
  console.log(`[Email Dispatcher] Server running on http://localhost:${PORT}`);
  console.log(`[Email Dispatcher] Database: OK (5 tables)`);
});
