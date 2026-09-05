import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { pushLine, reminderPayload } from '../services/lineNotify.js';
import { schoolDate } from '../../shared/schoolDate.js';

async function sendReminder(assignment, kind) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !assignment.classRoom.lineGroupId) return null;
  const where = { assignmentId_kind: { assignmentId: assignment.id, kind } };
  // Commit the immutable retry key and message before an external side effect.
  const log = await prisma.reminderLog.upsert({ where, update: {}, create: {
    assignmentId: assignment.id, kind, status: 'pending', sentAt: null,
    retryKey: randomUUID(), payload: reminderPayload(assignment.classRoom, assignment, kind),
  } });
  if (log.status !== 'pending') return null;
  await prisma.reminderLog.updateMany({ where: { id: log.id, attemptedAt: null }, data: { attemptedAt: new Date() } });
  return prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(72491, ${log.id}::integer) AS acquired`;
    if (!lock.acquired) return null;
    const current = await tx.reminderLog.findUnique({ where });
    if (current.status !== 'pending') return null;
    // LINE expires retry keys at 24 hours; require reconciliation before resending
    // an ambiguous old attempt instead of risking a duplicate.
    if (Date.now() - current.attemptedAt.getTime() >= 23 * 60 * 60 * 1000) {
      await tx.reminderLog.update({ where, data: { status: 'needs_review', lastError: 'Retry window expired; verify provider acceptance before resending' } });
      return null;
    }
    const result = await pushLine(current.payload, current.retryKey);
    if (!result.accepted) {
      await tx.reminderLog.update({ where, data: { lastError: result.error } });
      return null;
    }
    await tx.reminderLog.update({ where, data: { status: 'sent', sentAt: new Date(), lastError: null } });
    return { assignmentId: assignment.id, title: assignment.title, kind };
  }, { timeout: 20000 });
}

export async function runReminders() {
  const today = schoolDate();
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const assignments = await prisma.assignment.findMany({
    where: { dueDate: { not: null, lte: tomorrow.toISOString().slice(0, 10) } },
    include: { classRoom: true }, orderBy: { dueDate: 'asc' },
  });
  const sent = [];
  for (const assignment of assignments) {
    const kind = assignment.dueDate < today ? 'expired' : 'due_tomorrow';
    const result = await sendReminder(assignment, kind);
    if (result) sent.push(result);
  }
  return sent;
}
