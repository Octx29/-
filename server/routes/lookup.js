import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';

const router = Router();

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const TERMS = ['pre_midterm', 'midterm', 'final'];

// GET /api/lookup/:studentId - public, unauthenticated, 5-digit student ID only.
// Every query below is scoped to this one student's own DB id - never "all rows for the class".
router.get('/:studentId', lookupLimiter, async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { studentId: req.params.studentId },
    include: { classRoom: { select: { id: true, name: true, subject: true } } },
  });
  if (!student) return res.status(404).json({ error: 'ไม่พบรหัสนักเรียนนี้' });

  const [attendanceRecords, submissions, termEntries] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId: student.id },
      orderBy: { date: 'desc' },
      take: 30,
    }),
    prisma.submission.findMany({
      where: { studentId: student.id },
      include: { assignment: true },
    }),
    prisma.termScoreEntry.findMany({ where: { studentId: student.id } }),
  ]);

  const assignments = await prisma.assignment.findMany({
    where: { classRoomId: student.classRoomId },
    orderBy: { createdAt: 'desc' },
  });
  const submissionByAssignment = Object.fromEntries(submissions.map((s) => [s.assignmentId, s]));

  const attendanceCounts = { present: 0, absent: 0, late: 0 };
  for (const r of attendanceRecords) attendanceCounts[r.status] = (attendanceCounts[r.status] ?? 0) + 1;

  const termScores = {};
  for (const term of TERMS) {
    const entry = termEntries.find((e) => e.term === term);
    termScores[term] = entry ? { score: entry.score, maxScore: entry.maxScore } : null;
  }

  res.json({
    student: { name: student.name, roll: student.studentId, className: student.classRoom.name, subject: student.classRoom.subject },
    attendance: {
      counts: attendanceCounts,
      recent: attendanceRecords.map((r) => ({ date: r.date, status: r.status })),
    },
    assignments: assignments.map((a) => {
      const submission = submissionByAssignment[a.id];
      return {
        title: a.title,
        type: a.type,
        dueDate: a.dueDate,
        maxScore: a.maxScore,
        submitted: !!submission?.submittedAt,
        score: submission?.score ?? null,
      };
    }),
    termScores,
  });
});

export default router;
