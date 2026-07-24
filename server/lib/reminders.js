import { prisma } from './prisma.js';
import { notifyDueTomorrow, notifyExpired } from '../services/lineNotify.js';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokTodayIso() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendIfNotAlreadySent(assignment, kind, send) {
  const already = await prisma.reminderLog.findUnique({
    where: { assignmentId_kind: { assignmentId: assignment.id, kind } },
  });
  if (already) return null;

  await send();
  await prisma.reminderLog.create({ data: { assignmentId: assignment.id, kind } });
  return { assignmentId: assignment.id, title: assignment.title, kind };
}

// Computes due-tomorrow and just-expired reminders for the current Asia/Bangkok date and sends
// each assignment at most once per kind (ReminderLog is the idempotency guard), so re-running
// this (manual retrigger, cron firing twice) never double-sends.
export async function runReminders() {
  const today = bangkokTodayIso();
  const tomorrow = addDaysIso(today, 1);
  const yesterday = addDaysIso(today, -1);

  const sent = [];

  const dueTomorrow = await prisma.assignment.findMany({
    where: { dueDate: tomorrow },
    include: { classRoom: true },
  });
  for (const a of dueTomorrow) {
    const result = await sendIfNotAlreadySent(a, 'due_tomorrow', () => notifyDueTomorrow(a.classRoom, a));
    if (result) sent.push(result);
  }

  const justExpired = await prisma.assignment.findMany({
    where: { dueDate: yesterday },
    include: { classRoom: true },
  });
  for (const a of justExpired) {
    const result = await sendIfNotAlreadySent(a, 'expired', () => notifyExpired(a.classRoom, a));
    if (result) sent.push(result);
  }

  return sent;
}
