import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { signSession, setSessionCookie, clearSessionCookie, requireTeacher } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const teacher = await prisma.teacher.findUnique({ where: { username } });
  if (!teacher) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const valid = await bcrypt.compare(password, teacher.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const token = signSession(teacher);
  setSessionCookie(res, token);
  res.json({ id: teacher.id, username: teacher.username, name: teacher.name, subject: teacher.subject });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireTeacher, async (req, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacher.teacherId } });
  if (!teacher) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ id: teacher.id, username: teacher.username, name: teacher.name, subject: teacher.subject });
});

export default router;
