const express = require('express');
const router = express.Router();

// GET /api/dispatches — List dispatch history
router.get('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/dispatches — Create and start (or schedule) a dispatch
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// GET /api/dispatches/:id/logs — Individual logs for a dispatch
router.get('/:id/logs', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// GET /api/dispatches/:id/progress — SSE: real-time progress
router.get('/:id/progress', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/dispatches/:id/retry — Retry all failed entries
router.post('/:id/retry', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// DELETE /api/dispatches/:id — Cancel a scheduled dispatch
router.delete('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
