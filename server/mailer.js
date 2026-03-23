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
  result = result.replace(/\{\{([\w.-]+)\}\}/g, (match, varName) => {
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

module.exports = { createTransporter, renderTemplate };
