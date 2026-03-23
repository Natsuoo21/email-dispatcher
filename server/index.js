require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  let dbOk = false;
  let tableCount = 0;
  try {
    const row = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get();
    tableCount = row.cnt;
    dbOk = tableCount >= 5;
  } catch (e) {
    dbOk = false;
  }

  res.json({
    status: 'ok',
    database: dbOk,
    uptime: process.uptime(),
    tables: tableCount,
  });
});

// Routes
app.use('/api/templates', require('./routes/templates'));
app.use('/api/recipient-lists', require('./routes/recipients'));
app.use('/api/smtp-accounts', require('./routes/smtp'));
app.use('/api/dispatches', require('./routes/dispatches'));

const { initScheduler } = require('./scheduler');
initScheduler();

// Recover dispatches stuck in 'sending' status from previous crash
const stuck = db.prepare("SELECT id, name FROM dispatches WHERE status = 'sending'").all();
if (stuck.length > 0) {
  for (const d of stuck) {
    db.prepare("UPDATE dispatches SET status = 'failed', finished_at = datetime('now') WHERE id = ?").run(d.id);
    console.log(`[Email Dispatcher] Recovered stuck dispatch: ${d.name} (${d.id}) -> failed`);
  }
}

const server = app.listen(PORT, () => {
  const tableCount = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get().cnt;
  console.log(`[Email Dispatcher] Server running on http://localhost:${PORT}`);
  console.log(`[Email Dispatcher] Database: OK (${tableCount} tables)`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[Email Dispatcher] ${signal} received — shutting down`);
  server.close(() => {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
