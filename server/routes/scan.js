import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom, ownedAssignment } from '../lib/authorize.js';
import { syncToSheets } from '../services/sheetsSync.js';

const router = Router();
const todayIso = () => new Date().toISOString().slice(0, 10);

// POST /api/scan/attendance  { classId, studentCode }
router.post('/attendance', requireTeacher, async (req, res) => {
  const { classId, studentCode } = req.body;
  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const student = await prisma.student.findFirst({ where: { studentId: studentCode, classRoomId: classRoom.id } });
  if (!student) return res.status(404).json({ error: 'ไม่พบนักเรียนรหัสนี้ในห้องนี้' });

  const date = todayIso();
  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId: student.id, date } },
    create: { studentId: student.id, classRoomId: classRoom.id, date, status: 'present', checkedVia: 'qr' },
    update: { status: 'present', checkedVia: 'qr' },
  });

  await syncToSheets(prisma);
  res.json({ ok: true, student: { roll: student.studentId, name: student.name } });
});

// POST /api/scan/submission  { assignmentId, studentCode }
router.post('/submission', requireTeacher, async (req, res) => {
  const { assignmentId, studentCode } = req.body;
  const assignment = await ownedAssignment(assignmentId, req.teacher.teacherId);
  if (!assignment) return res.status(404).json({ error: 'ไม่พบงานนี้' });

  const student = await prisma.student.findFirst({ where: { studentId: studentCode, classRoomId: assignment.classRoomId } });
  if (!student) return res.status(404).json({ error: 'ไม่พบนักเรียนรหัสนี้ในห้องนี้' });

  await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
    create: { assignmentId: assignment.id, studentId: student.id, submittedAt: new Date(), checkedVia: 'qr' },
    update: { submittedAt: new Date(), checkedVia: 'qr' },
  });

  await syncToSheets(prisma);
  res.json({ ok: true, student: { roll: student.studentId, name: student.name } });
});

// POST /api/scan/materials  { classId, studentCode }
router.post('/materials', requireTeacher, async (req, res) => {
  const { classId, studentCode } = req.body;
  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const student = await prisma.student.findFirst({ where: { studentId: studentCode, classRoomId: classRoom.id } });
  if (!student) return res.status(404).json({ error: 'ไม่พบนักเรียนรหัสนี้ในห้องนี้' });

  const date = todayIso();
  await prisma.materialsCheck.upsert({
    where: { studentId_date: { studentId: student.id, date } },
    create: { studentId: student.id, date, broughtMaterials: true, checkedVia: 'qr' },
    update: { broughtMaterials: true, checkedVia: 'qr' },
  });

  res.json({ ok: true, student: { roll: student.studentId, name: student.name } });
});

export default router;
