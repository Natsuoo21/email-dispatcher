# Email Dispatcher

HTML Email Sender with Own SMTP — send beautiful, personalized emails to multiple recipients using your own Gmail or Outlook account.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Natsuoo21/email-dispatcher.git
cd email-dispatcher
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env with your SMTP credentials

# 3. Start the app
npm start
# Server: http://localhost:3001
# Client: http://localhost:3000
```

## Features

- Monaco HTML editor with live iframe preview
- CSV/XLSX recipient import with auto-detection
- `{{variable}}` personalization per recipient
- Multiple SMTP accounts (Gmail, Outlook, custom)
- Scheduled dispatch with node-cron
- Real-time send progress via SSE
- Full dispatch logs with one-click retry
