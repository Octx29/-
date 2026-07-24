import './lib/env.js';
import express from 'express';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import classesRoutes from './routes/classes.js';
import attendanceRoutes from './routes/attendance.js';
import assignmentsRoutes from './routes/assignments.js';
import termScoresRoutes from './routes/termScores.js';
import scheduleRoutes from './routes/schedule.js';
import missingWorkRoutes from './routes/missingWork.js';
import reportsRoutes from './routes/reports.js';
import lookupRoutes from './routes/lookup.js';
import scanRoutes from './routes/scan.js';
import cronRoutes from './routes/cron.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();

// One hop of reverse proxy (Vercel's edge) sits in front in production, so req.ip / X-Forwarded-For
// is trustworthy from exactly one layer out. Without this, express-rate-limit keys every request
// off the proxy's own IP behind Vercel, turning the per-user login/lookup limits into one shared
// global limit.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/term-scores', termScoresRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/missing-work', missingWorkRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/dashboard', dashboardRoutes);

export default app;
