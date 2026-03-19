const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { createTransporter } = require('../mailer');

// GET /api/smtp-accounts — List all accounts (no credentials)
router.get('/', (req, res) => {
  const accounts = db.prepare(
    'SELECT id, name, email, host, port, env_key, is_default, created_at FROM smtp_accounts ORDER BY created_at DESC'
  ).all();
  res.json(accounts);
});

// POST /api/smtp-accounts — Register a new account
router.post('/', (req, res) => {
  const { name, email, host, port, env_key } = req.body;

  if (!name || !email || !host || !port || !env_key) {
    return res.status(400).json({ error: 'All fields are required: name, email, host, port, env_key' });
  }

  // Check env_key exists in environment
  if (!process.env[env_key]) {
    return res.status(400).json({
      error: `Environment variable "${env_key}" is not set. Add it to your .env file and restart the server.`,
    });
  }

  // Check env_key uniqueness
  const existing = db.prepare('SELECT id FROM smtp_accounts WHERE env_key = ?').get(env_key);
  if (existing) {
    return res.status(409).json({ error: `An account with env_key "${env_key}" already exists.` });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO smtp_accounts (id, name, email, host, port, env_key) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, email, host, port, env_key);

  // If this is the first account, make it default
  const count = db.prepare('SELECT count(*) as cnt FROM smtp_accounts').get().cnt;
  if (count === 1) {
    db.prepare('UPDATE smtp_accounts SET is_default = 1 WHERE id = ?').run(id);
  }

  const account = db.prepare('SELECT id, name, email, host, port, env_key, is_default, created_at FROM smtp_accounts WHERE id = ?').get(id);
  res.status(201).json(account);
});

// PUT /api/smtp-accounts/:id/default — Set as default
router.put('/:id/default', (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT id FROM smtp_accounts WHERE id = ?').get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  db.prepare('UPDATE smtp_accounts SET is_default = 0').run();
  db.prepare('UPDATE smtp_accounts SET is_default = 1 WHERE id = ?').run(id);

  res.json({ message: 'Default account updated' });
});

// POST /api/smtp-accounts/:id/test — Send a test email
router.post('/:id/test', async (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  try {
    const transporter = createTransporter(account);
    await transporter.sendMail({
      from: `"Email Dispatcher" <${account.email}>`,
      to: account.email,
      subject: 'Email Dispatcher — Test Connection ✓',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">Email Dispatcher — Test Successful!</h2>
          <p>If you're reading this, your SMTP configuration is working correctly.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Account</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${account.name}</strong></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${account.email}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Host</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${account.host}:${account.port}</td></tr>
            <tr><td style="padding: 8px; color: #666;">Time</td><td style="padding: 8px;">${new Date().toISOString()}</td></tr>
          </table>
          <p style="margin-top: 24px; color: #999; font-size: 12px;">Sent by Email Dispatcher</p>
        </div>
      `,
    });

    res.json({ success: true, message: 'Test email sent successfully. Check your inbox.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/smtp-accounts/:id — Remove an account
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const account = db.prepare('SELECT id, is_default FROM smtp_accounts WHERE id = ?').get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Check for pending dispatches using this account
  const pending = db.prepare(
    "SELECT count(*) as cnt FROM dispatches WHERE smtp_account_id = ? AND status IN ('draft', 'scheduled', 'sending')"
  ).get(id);
  if (pending.cnt > 0) {
    return res.status(409).json({
      error: `Cannot delete: ${pending.cnt} pending dispatch(es) use this account.`,
    });
  }

  db.prepare('DELETE FROM smtp_accounts WHERE id = ?').run(id);

  // If deleted account was default, make the first remaining account default
  if (account.is_default) {
    const first = db.prepare('SELECT id FROM smtp_accounts ORDER BY created_at LIMIT 1').get();
    if (first) {
      db.prepare('UPDATE smtp_accounts SET is_default = 1 WHERE id = ?').run(first.id);
    }
  }

  res.json({ message: 'Account deleted' });
});

module.exports = router;
