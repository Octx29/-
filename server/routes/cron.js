import { Router } from 'express';
import { runReminders } from '../lib/reminders.js';

const router = Router();

// POST /api/cron/run-reminders - called by an external scheduler (GitHub Actions cron, Vercel
// Cron, cron-job.org, ...) once deployed. Protected by a shared secret header, not teacher auth,
// since the caller is a machine, not a logged-in teacher.
router.post('/run-reminders', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const sent = await runReminders();
  res.json({ ok: true, sent });
});

export default router;
