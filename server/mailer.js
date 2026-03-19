const nodemailer = require('nodemailer');

/**
 * Create a Nodemailer transporter for a given SMTP account.
 * Password is read from process.env using the account's env_key.
 */
function createTransporter(account) {
  const password = process.env[account.env_key];
  if (!password) {
    throw new Error(`Environment variable "${account.env_key}" is not set. Add it to your .env file.`);
  }

  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465,
    auth: {
      user: account.email,
      pass: password,
    },
    tls: { rejectUnauthorized: true },
  });
}

/**
 * Replace all {{variable}} placeholders in a template string.
 * @param {string} template - HTML or subject string with {{vars}}
 * @param {object} recipientData - Row data from CSV (e.g., { "Full Name": "Alice", "Company": "Acme" })
 * @param {object} variableMap - Map of variable name → column name (e.g., { name: "Full Name" })
 * @param {object} defaults - Default values for unmapped variables (e.g., { company: "your company" })
 */
function renderTemplate(template, recipientData, variableMap, defaults = {}) {
  let result = template;

  for (const [variable, column] of Object.entries(variableMap)) {
    const rawValue = recipientData[column] ?? defaults[variable] ?? '';
    // Escape HTML special characters to prevent XSS
    const value = String(rawValue)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    result = result.replaceAll(`{{${variable}}}`, value);
  }

  // Replace any remaining unmapped variables with defaults or empty string
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const defaultVal = defaults[varName] ?? '';
    return String(defaultVal)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  });

  return result;
}

/**
 * Send a dispatch: loop through recipients with rate limiting.
 * Emits progress via SSE stream.
 */
async function runDispatch(dispatch, recipients, transporter, sseRes, db) {
  const DELAY_MS = 1000; // 1 email per second
  const variableMap = JSON.parse(dispatch.variable_map);

  for (let i = 0; i < recipients.length; i++) {
    const log = recipients[i];
    const recipientData = JSON.parse(log.recipient_data);
    const html = renderTemplate(dispatch.html_content, recipientData, variableMap);
    const subject = renderTemplate(dispatch.subject, recipientData, variableMap);

    try {
      await transporter.sendMail({
        from: `"${dispatch.sender_name}" <${dispatch.smtp_email}>`,
        to: log.recipient_email,
        subject,
        html,
      });

      db.prepare('UPDATE dispatch_logs SET status = ?, sent_at = datetime(?) WHERE id = ?')
        .run('sent', new Date().toISOString(), log.id);
      db.prepare('UPDATE dispatches SET sent_count = sent_count + 1 WHERE id = ?')
        .run(dispatch.id);
    } catch (err) {
      db.prepare('UPDATE dispatch_logs SET status = ?, error_message = ? WHERE id = ?')
        .run('failed', err.message, log.id);
      db.prepare('UPDATE dispatches SET failed_count = failed_count + 1 WHERE id = ?')
        .run(dispatch.id);
    }

    // Emit SSE progress
    if (sseRes && !sseRes.writableEnded) {
      sseRes.write(`data: ${JSON.stringify({
        sent: i + 1,
        total: recipients.length,
        current_email: log.recipient_email,
        status: 'sending',
      })}\n\n`);
    }

    // Rate limit: wait before next send (skip after last)
    if (i < recipients.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Finalize dispatch
  db.prepare('UPDATE dispatches SET status = ?, finished_at = datetime(?) WHERE id = ?')
    .run('done', new Date().toISOString(), dispatch.id);

  // Final SSE event
  const final = db.prepare('SELECT sent_count, failed_count FROM dispatches WHERE id = ?').get(dispatch.id);
  if (sseRes && !sseRes.writableEnded) {
    sseRes.write(`data: ${JSON.stringify({
      status: 'done',
      sent_count: final.sent_count,
      failed_count: final.failed_count,
    })}\n\n`);
    sseRes.end();
  }
}

module.exports = { createTransporter, renderTemplate, runDispatch };
