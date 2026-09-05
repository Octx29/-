import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom, ownedAssignment, assertBatchBelongsToClassRoom } from '../lib/authorize.js';
import { syncToSheets } from '../services/sheetsSync.js';
import { notifyNewAssignment } from '../services/lineNotify.js';

import { validMaximum, validScore } from '../lib/validation.js';
import { validDate } from '../../shared/schoolDate.js';
import { saveSubmission } from '../lib/saveSubmission.js';

const router = Router();
const VALID_TYPES = new Set(['homework', 'quiz', 'in_class']);

// GET /api/assignments?classId=1
router.get('/', requireTeacher, async (req, res) => {
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ error: 'ต้องระบุ classId' });

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const [assignments, totalStudents] = await Promise.all([
    prisma.assignment.findMany({
      where: { classRoomId: classRoom.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: { where: { submittedAt: { not: null } } } } } },
    }),
    prisma.student.count({ where: { classRoomId: classRoom.id } }),
  ]);

  res.json(
    assignments.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      dueDate: a.dueDate,
      maxScore: a.maxScore,
      submittedCount: a._count.submissions,
      totalStudents,
    }))
  );
});

// POST /api/assignments  { classId, title, type, dueDate, maxScore }
router.post('/', requireTeacher, async (req, res) => {
  const { classId, title, type, dueDate, maxScore } = req.body;
  if (!classId || !title || !VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วนหรือประเภทงานไม่ถูกต้อง' });
  }

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  if (typeof title !== 'string' || !title.trim() || !validMaximum(maxScore ?? 100, true)
      || (dueDate && !validDate(dueDate))) {
    return res.status(400).json({ error: 'ชื่อ คะแนนเต็ม หรือวันที่ไม่ถูกต้อง' });
  }
  const assignment = await prisma.assignment.create({
    data: {
      classRoomId: classRoom.id,
      title: title.trim(),
      type,
      dueDate: dueDate || null,
      maxScore: Number(maxScore ?? 100),
    },
  });

  await notifyNewAssignment(classRoom, assignment);
  res.status(201).json(assignment);
});

// GET /api/assignments/:id/submissions
router.get('/:id/submissions', requireTeacher, async (req, res) => {
  const assignment = await ownedAssignment(req.params.id, req.teacher.teacherId);
  if (!assignment) return res.status(404).json({ error: 'ไม่พบงานนี้' });

  const students = await prisma.student.findMany({
    where: { classRoomId: assignment.classRoomId },
    orderBy: { studentId: 'asc' },
  });
  const submissions = await prisma.submission.findMany({ where: { assignmentId: assignment.id } });
  const byStudent = Object.fromEntries(submissions.map((s) => [s.studentId, s]));

  res.json({
    assignment,
    roster: students.map((s) => ({
      studentId: s.id,
      roll: s.studentId,
      name: s.name,
      submitted: !!byStudent[s.id]?.submittedAt,
      score: byStudent[s.id]?.submittedAt ? byStudent[s.id].score : null,
    })),
  });
});

// POST /api/assignments/:id/submissions  { records: [{ studentId (db id), submitted, score }] }
router.post('/:id/submissions', requireTeacher, async (req, res) => {
  const assignment = await ownedAssignment(req.params.id, req.teacher.teacherId);
  if (!assignment) return res.status(404).json({ error: 'ไม่พบงานนี้' });

  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });

  // The assignment is owned, but the student IDs in the body are not implied by that.
  // Any student outside the assignment's classroom rejects the whole batch.
  if (records.some(r => !r || typeof r.submitted !== 'boolean' || !validScore(r.score, assignment.maxScore, true))) {
    return res.status(400).json({ error: 'สถานะหรือคะแนนไม่ถูกต้อง คะแนนต้องอยู่ระหว่าง 0 และคะแนนเต็ม' });
  }
  const batchError = await assertBatchBelongsToClassRoom(
    records.map((r) => r.studentId),
    assignment.classRoomId
  );
  if (batchError) return res.status(batchError.status).json(batchError.body);

  await prisma.$transaction(records.map(r => saveSubmission(
    prisma, assignment.id, Number(r.studentId), r.submitted,
    r.score === '' || r.score == null ? null : Number(r.score)
  )));

  await syncToSheets(prisma);
  res.json({ ok: true });
});

export default router;
