import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom } from '../lib/authorize.js';

const router = Router();

router.get('/', requireTeacher, async (req, res) => {
  const classRooms = await prisma.classRoom.findMany({
    where: { teacherId: req.teacher.teacherId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, subject: true },
  });
  res.json(classRooms);
});

// GET /api/classes/:id/students - roster for printing QR codes
router.get('/:id/students', requireTeacher, async (req, res) => {
  const classRoom = await ownedClassRoom(req.params.id, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const students = await prisma.student.findMany({
    where: { classRoomId: classRoom.id },
    orderBy: { studentId: 'asc' },
    select: { id: true, studentId: true, name: true },
  });
  res.json(students.map((s) => ({ id: s.id, roll: s.studentId, name: s.name })));
});

export default router;
