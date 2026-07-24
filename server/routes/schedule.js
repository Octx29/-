import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';

const router = Router();

// GET /api/schedule - every scheduled slot across this teacher's classes
router.get('/', requireTeacher, async (req, res) => {
  const slots = await prisma.scheduleSlot.findMany({
    where: { classRoom: { teacherId: req.teacher.teacherId } },
    include: { classRoom: { select: { name: true, subject: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  res.json(
    slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      classRoomId: s.classRoomId,
      className: s.classRoom.name,
      subject: s.classRoom.subject,
    }))
  );
});

export default router;
