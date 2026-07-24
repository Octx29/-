import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';

const router = Router();
const todayIso = () => new Date().toISOString().slice(0, 10);

// GET /api/dashboard - per-classroom stats for this teacher's dashboard cards
router.get('/', requireTeacher, async (req, res) => {
  const classRooms = await prisma.classRoom.findMany({
    where: { teacherId: req.teacher.teacherId },
    orderBy: { name: 'asc' },
  });

  const today = todayIso();

  const result = await Promise.all(
    classRooms.map(async (classRoom) => {
      const [studentCount, presentCount, pendingGradingCount] = await Promise.all([
        prisma.student.count({ where: { classRoomId: classRoom.id } }),
        prisma.attendanceRecord.count({
          where: { classRoomId: classRoom.id, date: today, status: 'present' },
        }),
        prisma.submission.count({
          where: {
            assignment: { classRoomId: classRoom.id },
            submittedAt: { not: null },
            score: null,
          },
        }),
      ]);

      return {
        id: classRoom.id,
        name: classRoom.name,
        subject: classRoom.subject,
        studentCount,
        attendanceRate: studentCount > 0 ? Math.round((presentCount / studentCount) * 100) : 0,
        pendingGradingCount,
      };
    })
  );

  res.json(result);
});

export default router;
