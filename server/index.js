import cron from 'node-cron';
import app from './app.js';
import { runReminders } from './lib/reminders.js';

// In-process daily run for local dev; in production an external scheduler hits
// POST /api/cron/run-reminders on the deployed URL instead - same code path either way.
cron.schedule(
  '0 7 * * *',
  () => {
    runReminders().catch((err) => console.error('[cron] runReminders failed:', err));
  },
  { timezone: 'Asia/Bangkok' }
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
