import { Router } from 'express';
import { requireTeacher } from '../middleware/auth.js';
import { getMissingWorkData } from '../lib/reportData.js';

const router = Router();

// GET /api/missing-work?classId=1 (classId optional - omit for all of this teacher's classes)
router.get('/', requireTeacher, async (req, res) => {
  const result = await getMissingWorkData(req.teacher.teacherId, req.query.classId);
  res.json(result);
});

export default router;
