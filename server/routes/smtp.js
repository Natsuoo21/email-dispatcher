const express = require('express');
const router = express.Router();

// GET /api/smtp-accounts — List SMTP accounts (no credentials)
router.get('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/smtp-accounts — Register a new SMTP account
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/smtp-accounts/:id/test — Send a test email
router.post('/:id/test', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/smtp-accounts/:id/default — Set as default
router.put('/:id/default', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// DELETE /api/smtp-accounts/:id — Remove an SMTP account
router.delete('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
