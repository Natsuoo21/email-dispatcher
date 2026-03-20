const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { createTransporter, runDispatch } = require('../mailer');
const router = express.Router();

// In-memory map of active dispatches for SSE
const activeDispatches = new Map();

// GET /api/dispatches — List dispatch history (with optional filters)
router.get('/', (req, res) => {
  try {
    const { status, smtp_account_id, search, from, to } = req.query;
    let sql = `
      SELECT d.*, s.name as smtp_name, s.email as smtp_email, t.name as template_name
      FROM dispatches d
      LEFT JOIN smtp_accounts s ON d.smtp_account_id = s.id
      LEFT JOIN templates t ON d.template_id = t.id
    `;
    const conditions = [];
    const params = [];

    if (status) { conditions.push('d.status = ?'); params.push(status); }
    if (smtp_account_id) { conditions.push('d.smtp_account_id = ?'); params.push(smtp_account_id); }
    if (search) { conditions.push('(d.name LIKE ? OR t.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (from) { conditions.push('d.created_at >= ?'); params.push(from); }
    if (to) { conditions.push('d.created_at <= ?'); params.push(to); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY d.created_at DESC';

    const dispatches = db.prepare(sql).all(...params);
    res.json(dispatches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dispatches — Create and start (or schedule) a dispatch
router.post('/', (req, res) => {
  try {
    const {
      name, template_id, smtp_account_id, subject,
      variable_map, defaults, recipients, scheduled_at,
    } = req.body;

    if (!name || !template_id || !smtp_account_id || !subject || !recipients || !Array.isArray(recipients)) {
      return res.status(400).json({ error: 'name, template_id, smtp_account_id, subject, and recipients are required' });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    // Validate template and SMTP account exist
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(template_id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const account = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(smtp_account_id);
    if (!account) return res.status(404).json({ error: 'SMTP account not found' });

    const dispatchId = uuidv4();
    const vMap = JSON.stringify(variable_map || {});
    const defs = JSON.stringify(defaults || {});

    const insertDispatch = db.prepare(`
      INSERT INTO dispatches (id, name, template_id, smtp_account_id, subject, variable_map, status, scheduled_at, total_recipients)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLog = db.prepare(`
      INSERT INTO dispatch_logs (id, dispatch_id, recipient_email, recipient_data, status, smtp_account_id)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    const transaction = db.transaction(() => {
      insertDispatch.run(
        dispatchId, name.trim(), template_id, smtp_account_id, subject,
        vMap, scheduled_at ? 'scheduled' : 'sending',
        scheduled_at || null, recipients.length
      );

      for (const recipient of recipients) {
        const email = recipient.email;
        if (!email) continue;
        insertLog.run(uuidv4(), dispatchId, email, JSON.stringify(recipient), smtp_account_id);
      }
    });

    transaction();

    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(dispatchId);

    // Start sending immediately if not scheduled
    if (!scheduled_at) {
      startDispatch(dispatchId, template, account, vMap, defs);
    }

    res.status(201).json(dispatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Internal: start dispatching emails
function startDispatch(dispatchId, template, account, variableMapStr, defaultsStr) {
  const logs = db.prepare(
    "SELECT * FROM dispatch_logs WHERE dispatch_id = ? AND status = 'pending' ORDER BY created_at"
  ).all(dispatchId);

  const transporter = createTransporter(account);

  // Build dispatch object that runDispatch expects
  const dispatchObj = {
    id: dispatchId,
    html_content: template.html_content,
    subject: db.prepare('SELECT subject FROM dispatches WHERE id = ?').get(dispatchId).subject,
    variable_map: variableMapStr,
    defaults: defaultsStr,
    sender_name: account.name,
    smtp_email: account.email,
  };

  // Store reference for SSE connections
  const sseClients = [];
  activeDispatches.set(dispatchId, sseClients);

  // Run async send loop
  (async () => {
    const DELAY_MS = 1000;
    const variableMap = JSON.parse(variableMapStr);
    const defaults = JSON.parse(defaultsStr);
    const { renderTemplate } = require('../mailer');

    db.prepare("UPDATE dispatches SET started_at = datetime('now') WHERE id = ?").run(dispatchId);

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const recipientData = JSON.parse(log.recipient_data);
      const html = renderTemplate(template.html_content, recipientData, variableMap, defaults);
      const subject = renderTemplate(dispatchObj.subject, recipientData, variableMap, defaults);

      try {
        await transporter.sendMail({
          from: `"${account.name}" <${account.email}>`,
          to: log.recipient_email,
          subject,
          html,
        });

        db.prepare("UPDATE dispatch_logs SET status = 'sent', sent_at = datetime('now') WHERE id = ?")
          .run(log.id);
        db.prepare('UPDATE dispatches SET sent_count = sent_count + 1 WHERE id = ?')
          .run(dispatchId);
      } catch (err) {
        db.prepare("UPDATE dispatch_logs SET status = 'failed', error_message = ? WHERE id = ?")
          .run(err.message, log.id);
        db.prepare('UPDATE dispatches SET failed_count = failed_count + 1 WHERE id = ?')
          .run(dispatchId);
      }

      // Emit SSE to all connected clients
      const progress = {
        sent: i + 1,
        total: logs.length,
        current_email: log.recipient_email,
        status: 'sending',
      };
      for (const client of sseClients) {
        if (!client.writableEnded) {
          client.write(`data: ${JSON.stringify(progress)}\n\n`);
        }
      }

      if (i < logs.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    // Finalize
    db.prepare("UPDATE dispatches SET status = 'done', finished_at = datetime('now') WHERE id = ?")
      .run(dispatchId);

    const final = db.prepare('SELECT sent_count, failed_count FROM dispatches WHERE id = ?').get(dispatchId);
    const doneEvent = { status: 'done', sent_count: final.sent_count, failed_count: final.failed_count };

    for (const client of sseClients) {
      if (!client.writableEnded) {
        client.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
        client.end();
      }
    }

    activeDispatches.delete(dispatchId);
  })().catch(err => {
    console.error(`Dispatch ${dispatchId} error:`, err);
    db.prepare("UPDATE dispatches SET status = 'failed' WHERE id = ?").run(dispatchId);
    activeDispatches.delete(dispatchId);
  });
}

// GET /api/dispatches/:id/progress — SSE: real-time progress
router.get('/:id/progress', (req, res) => {
  const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
  if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // If already done, send final event immediately
  if (dispatch.status === 'done' || dispatch.status === 'failed') {
    res.write(`data: ${JSON.stringify({
      status: dispatch.status,
      sent_count: dispatch.sent_count,
      failed_count: dispatch.failed_count,
    })}\n\n`);
    res.end();
    return;
  }

  // Register as SSE client
  const clients = activeDispatches.get(req.params.id);
  if (clients) {
    clients.push(res);

    // Send current progress snapshot
    res.write(`data: ${JSON.stringify({
      sent: dispatch.sent_count + dispatch.failed_count,
      total: dispatch.total_recipients,
      status: dispatch.status,
    })}\n\n`);

    req.on('close', () => {
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
    });
  } else {
    // Dispatch not actively sending
    res.write(`data: ${JSON.stringify({
      status: dispatch.status,
      sent_count: dispatch.sent_count,
      failed_count: dispatch.failed_count,
    })}\n\n`);
    res.end();
  }
});

// GET /api/dispatches/:id/logs — Individual logs for a dispatch
router.get('/:id/logs', (req, res) => {
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });

    const logs = db.prepare(
      'SELECT * FROM dispatch_logs WHERE dispatch_id = ? ORDER BY created_at'
    ).all(req.params.id);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dispatches/:id/retry — Retry all failed entries
router.post('/:id/retry', (req, res) => {
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status === 'sending') return res.status(409).json({ error: 'Dispatch is still sending' });

    const failedLogs = db.prepare(
      "SELECT * FROM dispatch_logs WHERE dispatch_id = ? AND status = 'failed'"
    ).all(req.params.id);

    if (failedLogs.length === 0) {
      return res.json({ message: 'No failed emails to retry' });
    }

    // Reset failed logs to pending
    db.prepare(
      "UPDATE dispatch_logs SET status = 'pending', error_message = NULL WHERE dispatch_id = ? AND status = 'failed'"
    ).run(req.params.id);

    // Reset dispatch counters for retried entries
    db.prepare(
      "UPDATE dispatches SET status = 'sending', failed_count = 0, finished_at = NULL WHERE id = ?"
    ).run(req.params.id);

    // Get template and account to restart
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(dispatch.template_id);
    const account = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(dispatch.smtp_account_id);

    if (template && account) {
      startDispatch(req.params.id, template, account, dispatch.variable_map, '{}');
    }

    res.json({ message: `Retrying ${failedLogs.length} failed emails` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dispatches/:id/cancel — Soft-cancel a scheduled dispatch
router.post('/:id/cancel', (req, res) => {
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status !== 'scheduled') {
      return res.status(409).json({ error: 'Only scheduled dispatches can be cancelled' });
    }

    db.prepare("UPDATE dispatches SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?")
      .run(req.params.id);
    res.json({ message: 'Scheduled dispatch cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dispatches/:id/logs/export — CSV export of dispatch logs
router.get('/:id/logs/export', (req, res) => {
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });

    const logs = db.prepare(
      'SELECT recipient_email, status, error_message, sent_at, created_at FROM dispatch_logs WHERE dispatch_id = ? ORDER BY created_at'
    ).all(req.params.id);

    function csvEscape(val) {
      if (val == null) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const header = 'Email,Status,Error,Sent At,Created At';
    const rows = logs.map(l =>
      [l.recipient_email, l.status, l.error_message, l.sent_at, l.created_at].map(csvEscape).join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-${req.params.id}-logs.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dispatches/:id — Cancel a scheduled dispatch
router.delete('/:id', (req, res) => {
  try {
    const dispatch = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });

    if (dispatch.status === 'sending') {
      return res.status(409).json({ error: 'Cannot delete a dispatch that is currently sending' });
    }

    db.prepare('DELETE FROM dispatch_logs WHERE dispatch_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dispatches WHERE id = ?').run(req.params.id);
    res.json({ message: 'Dispatch deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.startDispatch = startDispatch;
router.activeDispatches = activeDispatches;
module.exports = router;
