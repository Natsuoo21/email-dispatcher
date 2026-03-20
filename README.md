# Email Dispatcher

HTML Email Sender with Own SMTP — send beautiful, personalized emails to multiple recipients using your own Gmail or Outlook account.

## Prerequisites

- **Node.js** 20+ (with npm)
- **Git**
- A Gmail or Outlook email account with SMTP access enabled

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Natsuoo21/email-dispatcher.git
cd email-dispatcher
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env with your SMTP credentials (see below)

# 3. Start the app
npm start
# Server: http://localhost:3001
# Client: http://localhost:3000
```

Open **http://localhost:3000** in your browser.

## Gmail App Password Setup

Gmail requires an **App Password** instead of your regular password. Regular passwords won't work with SMTP.

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select app: **Mail**, device: **Other** (enter "Email Dispatcher")
5. Click **Generate** — you'll get a 16-character password like `abcd efgh ijkl mnop`
6. Copy this password into your `.env` file as the value for `SMTP_GMAIL_PASS`

## Outlook Setup

For Outlook/Office 365 accounts:

- If **MFA is disabled**: use your regular Outlook password
- If **MFA is enabled**: generate an App Password at [Microsoft Security](https://account.live.com/proofs/manage)
- Set the password in `.env` as `SMTP_OUTLOOK_PASS`

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `SMTP_GMAIL_PASS` | Gmail App Password | `abcd efgh ijkl mnop` |
| `SMTP_OUTLOOK_PASS` | Outlook password or App Password | `your_password` |
| `PORT` | Backend server port (default: 3001) | `3001` |

Add one `SMTP_*` variable per SMTP account you register. The variable name must match the **Env Key** you enter when adding the account in Settings.

## CSV / XLSX Format

Your recipient file **must** include an `email` column. Additional columns can be used as template variables.

**Supported formats:** `.csv`, `.tsv`, `.xlsx`, `.xls`

**Example CSV:**
```csv
email,name,company
alice@example.com,Alice,Acme Corp
bob@example.com,Bob,Globex Inc
```

In your HTML template, use `{{name}}` and `{{company}}` to insert personalized values for each recipient.

## Features

- **Monaco HTML Editor** — full-featured code editor with syntax highlighting and live iframe preview
- **CSV/XLSX Import** — drag-and-drop recipient upload with auto-column detection
- **Variable Personalization** — `{{variable}}` syntax maps to CSV columns per recipient
- **Multiple SMTP Accounts** — Gmail, Outlook, or custom SMTP with provider detection
- **Scheduled Dispatch** — pick a future date/time with node-cron
- **Real-time Progress** — live send progress via Server-Sent Events (SSE)
- **Dispatch Logs** — full history with per-email status, one-click retry for failures
- **Account Health** — test connection status with stale-test warnings

## Architecture

```
email-dispatcher/
├── server/           # Node.js + Express backend (port 3001)
│   ├── index.js      # Express app, route mounting
│   ├── db.js         # SQLite via better-sqlite3
│   ├── mailer.js     # Nodemailer transporter factory
│   ├── scheduler.js  # node-cron for scheduled dispatches
│   └── routes/       # API routes (smtp, templates, recipients, dispatches)
├── client/           # React 18 + Vite frontend (port 3000)
│   └── src/
│       ├── App.jsx   # Sidebar navigation, page routing
│       ├── api.js    # Fetch wrappers for all API endpoints
│       └── pages/    # Editor, Recipients, Compose, Logs, Settings
├── data/             # SQLite database file (auto-created)
└── .env              # SMTP credentials (not committed)
```

- **Database**: SQLite (zero-config, single file at `data/dispatcher.db`)
- **Email**: Nodemailer with SMTP transport (1 email/sec rate limit)
- **Editor**: Monaco Editor via `@monaco-editor/react`
- **File parsing**: PapaParse (CSV) + SheetJS (XLSX), client-side only

## Known Limitations

- **Rate limits**: Gmail allows ~500 emails/day, Outlook ~300/day per account
- **Localhost only**: designed as a local development tool, not a production email service
- **No OAuth**: uses App Passwords / SMTP credentials, not OAuth2 flows
- **No attachments**: HTML body only, no file attachments
- **Single user**: no authentication or multi-user support

## License

MIT
