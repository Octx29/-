import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom } from '../lib/authorize.js';
import { syncToSheets } from '../services/sheetsSync.js';

const router = Router();
const TERMS = ['pre_midterm', 'midterm', 'final'];

// GET /api/term-scores?classId=1
router.get('/', requireTeacher, async (req, res) => {
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ error: 'ต้องระบุ classId' });

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const students = await prisma.student.findMany({
    where: { classRoomId: classRoom.id },
    orderBy: { studentId: 'asc' },
  });
  const entries = await prisma.termScoreEntry.findMany({ where: { classRoomId: classRoom.id } });

  res.json(
    students.map((s) => {
      const byTerm = {};
      for (const term of TERMS) {
        const entry = entries.find((e) => e.studentId === s.id && e.term === term);
        byTerm[term] = entry ? { score: entry.score, maxScore: entry.maxScore } : null;
      }
      return { studentId: s.id, roll: s.studentId, name: s.name, ...byTerm };
    })
  );
});

// POST /api/term-scores  { classId, records: [{ studentId, term, score, maxScore }] }
router.post('/', requireTeacher, async (req, res) => {
  const { classId, records } = req.body;
  if (!classId || !Array.isArray(records)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const valid = records.filter((r) => TERMS.includes(r.term) && r.score !== '' && r.score != null);

  await prisma.$transaction(
    valid.map((r) =>
      prisma.termScoreEntry.upsert({
        where: {
          studentId_classRoomId_term: { studentId: Number(r.studentId), classRoomId: classRoom.id, term: r.term },
        },
        create: {
          studentId: Number(r.studentId),
          classRoomId: classRoom.id,
          term: r.term,
          score: Number(r.score),
          maxScore: r.maxScore ? Number(r.maxScore) : 100,
        },
        update: { score: Number(r.score), maxScore: r.maxScore ? Number(r.maxScore) : 100 },
      })
    )
  );

  await syncToSheets(prisma);
  res.json({ ok: true });
});

export default router;
