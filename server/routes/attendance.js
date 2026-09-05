import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom, assertBatchBelongsToClassRoom } from '../lib/authorize.js';
import { syncToSheets } from '../services/sheetsSync.js';

const router = Router();

// GET /api/attendance?classId=1&date=2026-07-23
router.get('/', requireTeacher, async (req, res) => {
  const { classId, date } = req.query;
  if (!classId || !date) {
    return res.status(400).json({ error: 'ต้องระบุ classId และ date' });
  }

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const students = await prisma.student.findMany({
    where: { classRoomId: classRoom.id },
    orderBy: { studentId: 'asc' },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: { classRoomId: classRoom.id, date: String(date) },
  });
  const statusByStudent = Object.fromEntries(records.map((r) => [r.studentId, r.status]));

  res.json(
    students.map((s) => ({
      id: s.id,
      roll: s.studentId,
      name: s.name,
      status: statusByStudent[s.id] ?? null,
    }))
  );
});

// POST /api/attendance  { classId, date, records: [{ id (student db id), status }] }
router.post('/', requireTeacher, async (req, res) => {
  const { classId, date, records } = req.body;
  if (!classId || !date || !Array.isArray(records)) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const validStatuses = new Set(['present', 'absent', 'late']);
  const writable = records.filter((r) => validStatuses.has(r.status));

  // Owning the classroom does not imply owning the student IDs in the body. Every
  // student is checked against this classroom, and any foreign ID rejects the whole
  // batch rather than letting a partial write land.
  const batchError = await assertBatchBelongsToClassRoom(
    writable.map((r) => r.id),
    classRoom.id
  );
  if (batchError) return res.status(batchError.status).json(batchError.body);

  await prisma.$transaction(
    writable.map((r) =>
      prisma.attendanceRecord.upsert({
        // studentId_date is unique across classrooms, so the classroom is pinned on
        // both sides of the upsert: membership has just been verified above, and the
        // update leaves classRoomId untouched for an existing row.
        where: { studentId_date: { studentId: Number(r.id), date: String(date) } },
        create: {
          studentId: Number(r.id),
          classRoomId: classRoom.id,
          date: String(date),
          status: r.status,
        },
        update: { status: r.status, classRoomId: classRoom.id },
      })
    )
  );

  await syncToSheets(prisma);
  res.json({ ok: true });
});

export default router;
