const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const router = express.Router();

function detectVariables(html) {
  const matches = html.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

// GET /api/templates — List all templates
router.get('/', (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id — Get a single template
router.get('/:id', (req, res) => {
  try {
    const tpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates — Create a template
router.post('/', (req, res) => {
  try {
    const { name, subject, html_content } = req.body;
    if (!name || !subject || !html_content) {
      return res.status(400).json({ error: 'name, subject, and html_content are required' });
    }

    const id = uuidv4();
    const variables = JSON.stringify(detectVariables(html_content + ' ' + subject));

    db.prepare(
      'INSERT INTO templates (id, name, subject, html_content, variables) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name.trim(), subject, html_content, variables);

    const created = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id — Update a template
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { name, subject, html_content } = req.body;
    if (!name || !subject || !html_content) {
      return res.status(400).json({ error: 'name, subject, and html_content are required' });
    }

    const variables = JSON.stringify(detectVariables(html_content + ' ' + subject));

    db.prepare(
      `UPDATE templates SET name = ?, subject = ?, html_content = ?, variables = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name.trim(), subject, html_content, variables, req.params.id);

    const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id — Delete a template
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    // Check if template is used by any active dispatch
    const activeDispatch = db.prepare(
      "SELECT id FROM dispatches WHERE template_id = ? AND status IN ('draft', 'sending', 'scheduled')"
    ).get(req.params.id);

    if (activeDispatch) {
      return res.status(409).json({ error: 'Cannot delete: template is used by an active dispatch' });
    }

    db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
