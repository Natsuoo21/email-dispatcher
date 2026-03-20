const cron = require('node-cron');
const db = require('./db');
const dispatchRouter = require('./routes/dispatches');

function initScheduler() {
  // Check every minute for due scheduled dispatches
  cron.schedule('* * * * *', () => {
    try {
      const now = new Date().toISOString();
      const due = db.prepare(
        "SELECT * FROM dispatches WHERE status = 'scheduled' AND scheduled_at <= ?"
      ).all(now);

      for (const dispatch of due) {
        // Atomically claim it
        const result = db.prepare(
          "UPDATE dispatches SET status = 'sending' WHERE id = ? AND status = 'scheduled'"
        ).run(dispatch.id);

        if (result.changes === 0) continue; // another tick already claimed it

        const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(dispatch.template_id);
        const account = db.prepare('SELECT * FROM smtp_accounts WHERE id = ?').get(dispatch.smtp_account_id);

        if (!template || !account) {
          console.error(`[Scheduler] Dispatch ${dispatch.id}: missing template or SMTP account — marking failed`);
          db.prepare("UPDATE dispatches SET status = 'failed', finished_at = datetime('now') WHERE id = ?")
            .run(dispatch.id);
          continue;
        }

        console.log(`[Scheduler] Firing scheduled dispatch: ${dispatch.name} (${dispatch.id})`);
        dispatchRouter.startDispatch(dispatch.id, template, account, dispatch.variable_map, '{}');
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  });

  console.log('[Email Dispatcher] Scheduler: active (checking every 60s)');
}

module.exports = { initScheduler };
