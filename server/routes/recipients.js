const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const router = express.Router();

// GET /api/recipient-lists — List all saved lists
router.get('/', (req, res) => {
  try {
    const lists = db.prepare('SELECT * FROM recipient_lists ORDER BY created_at DESC').all();
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recipient-lists — Save a new list with rows
router.post('/', (req, res) => {
  try {
    const { name, columns, rows } = req.body;
    if (!name || !columns || !rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'name, columns, and rows are required' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'List must have at least one recipient' });
    }

    if (rows.length > 50000) {
      return res.status(400).json({ error: 'Recipient list too large. Maximum 50,000 rows.' });
    }

    const id = uuidv4();

    const insertList = db.prepare(
      'INSERT INTO recipient_lists (id, name, columns, row_count) VALUES (?, ?, ?, ?)'
    );
    const insertRow = db.prepare(
      'INSERT INTO recipient_rows (id, list_id, data, position) VALUES (?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      insertList.run(id, name.trim(), columns, rows.length);
      for (let i = 0; i < rows.length; i++) {
        insertRow.run(uuidv4(), id, JSON.stringify(rows[i]), i);
      }
    });

    transaction();

    const created = db.prepare('SELECT * FROM recipient_lists WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipient-lists/:id — Get a specific list with all rows
router.get('/:id', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM recipient_lists WHERE id = ?').get(req.params.id);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const rows = db.prepare(
      'SELECT * FROM recipient_rows WHERE list_id = ? ORDER BY position ASC'
    ).all(req.params.id);

    res.json({ ...list, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recipient-lists/:id — Delete a list and all its rows (CASCADE)
router.delete('/:id', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM recipient_lists WHERE id = ?').get(req.params.id);
    if (!list) return res.status(404).json({ error: 'List not found' });

    db.prepare('DELETE FROM recipient_lists WHERE id = ?').run(req.params.id);
    res.json({ message: 'List deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
