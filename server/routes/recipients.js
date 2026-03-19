const express = require('express');
const router = express.Router();

// GET /api/recipient-lists — List all saved lists
router.get('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/recipient-lists — Save a new list with rows
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// GET /api/recipient-lists/:id — Get a specific list with rows
router.get('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// DELETE /api/recipient-lists/:id — Delete a list
router.delete('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
