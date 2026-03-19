const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'dispatcher.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================
// MIGRATIONS — All 5 tables created at startup
// ============================================

db.exec(`
  CREATE TABLE IF NOT EXISTS smtp_accounts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL,
    env_key     TEXT NOT NULL UNIQUE,
    is_default  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    subject      TEXT NOT NULL,
    html_content TEXT NOT NULL,
    variables    TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipient_lists (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    columns    TEXT NOT NULL,
    row_count  INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recipient_rows (
    id       TEXT PRIMARY KEY,
    list_id  TEXT NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
    data     TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rows_list ON recipient_rows(list_id);

  CREATE TABLE IF NOT EXISTS dispatches (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    template_id       TEXT REFERENCES templates(id),
    smtp_account_id   TEXT NOT NULL REFERENCES smtp_accounts(id),
    subject           TEXT NOT NULL,
    variable_map      TEXT NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'draft',
    scheduled_at      TEXT,
    started_at        TEXT,
    finished_at       TEXT,
    total_recipients  INTEGER DEFAULT 0,
    sent_count        INTEGER DEFAULT 0,
    failed_count      INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dispatch_logs (
    id               TEXT PRIMARY KEY,
    dispatch_id      TEXT NOT NULL REFERENCES dispatches(id),
    recipient_email  TEXT NOT NULL,
    recipient_data   TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    smtp_account_id  TEXT,
    error_message    TEXT,
    sent_at          TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_logs_dispatch ON dispatch_logs(dispatch_id, status);
  CREATE INDEX IF NOT EXISTS idx_logs_email    ON dispatch_logs(recipient_email);
`);

module.exports = db;
