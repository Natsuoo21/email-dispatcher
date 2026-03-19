const express = require('express');
const router = express.Router();

// GET /api/templates — List all templates
router.get('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/templates — Create a template
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/templates/:id — Update a template
router.put('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// DELETE /api/templates/:id — Delete a template
router.delete('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
