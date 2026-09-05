import { test, expect } from '@playwright/test';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

// These tests drive the real Express routers against an in-memory Prisma double.
// They need the generated Prisma client to exist (npm run postinstall / prisma generate);
// where it does not, they skip rather than reporting a false pass.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
delete process.env.GOOGLE_SHEET_ID;

let modules = null;
try {
  modules = {
    prismaModule: await import('../server/lib/prisma.js'),
    attendance: (await import('../server/routes/attendance.js')).default,
    assignments: (await import('../server/routes/assignments.js')).default,
    termScores: (await import('../server/routes/termScores.js')).default,
    scan: (await import('../server/routes/scan.js')).default,
  };
} catch (err) {
  console.warn(`[batch-authorization] skipping: ${err.message}`);
}

test.skip(!modules, 'generated Prisma client is unavailable - run `npx prisma generate` first');

// Teacher A owns classroom 1 with student 11; teacher B owns classroom 2 with student 22.
function makeWorld() {
  const world = {
    writes: [],
    classRooms: [
      { id: 1, teacherId: 1, name: 'Class One' },
      { id: 2, teacherId: 2, name: 'Class Two' },
    ],
    students: [
      { id: 11, studentId: '91001', classRoomId: 1, name: 'Pupil One' },
      { id: 22, studentId: '91002', classRoomId: 2, name: 'Pupil Two' },
    ],
    assignments: [
      { id: 101, classRoomId: 1, title: 'Assignment A', maxScore: 100 },
      { id: 201, classRoomId: 2, title: 'Assignment C', maxScore: 100 },
    ],
  };

  const matches = (row, where) =>
    Object.entries(where).every(([field, expected]) => {
      if (field === 'classRoom') return matches(world.classRooms.find((c) => c.id === row.classRoomId) ?? {}, expected);
      if (expected && typeof expected === 'object' && Array.isArray(expected.in)) return expected.in.includes(row[field]);
      return row[field] === expected;
    });

  const record = (table) => ({
    upsert: async (args) => { world.writes.push({ table, args }); return {}; },
    findUnique: async () => null,
    findMany: async () => [],
  });

  return Object.assign(world, {
    prisma: {
      $transaction: async (operations) => Promise.all(operations),
      classRoom: { findFirst: async ({ where }) => world.classRooms.find((c) => matches(c, where)) ?? null },
      assignment: {
        findFirst: async ({ where }) => world.assignments.find((a) => matches(a, where)) ?? null,
        findMany: async () => [],
      },
      student: {
        findMany: async ({ where }) => world.students.filter((s) => matches(s, where)),
        findFirst: async ({ where }) => world.students.find((s) => matches(s, where)) ?? null,
        count: async () => world.students.length,
      },
      submission: record('submission'),
      attendanceRecord: record('attendanceRecord'),
      termScoreEntry: record('termScoreEntry'),
      materialsCheck: record('materialsCheck'),
      reminderLog: record('reminderLog'),
    },
  });
}

async function startServer(world) {
  modules.prismaModule.setPrismaClientForTests(world.prisma);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/attendance', modules.attendance);
  app.use('/api/assignments', modules.assignments);
  app.use('/api/term-scores', modules.termScores);
  app.use('/api/scan', modules.scan);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const cookie = `session=${jwt.sign({ teacherId: 1, username: 'teacher-a' }, process.env.JWT_SECRET)}`;
  return {
    server,
    post: (path, body) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify(body),
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test.describe('B01 bulk writes must reject students from another classroom', () => {
  let world;
  let api;

  test.beforeEach(async () => {
    world = makeWorld();
    api = await startServer(world);
  });
  test.afterEach(async () => { await api?.close(); });

  test('attendance rejects a foreign student and writes nothing', async () => {
    // Teacher A authenticates, sends A's own classroom ID with teacher B's student.
    const res = await api.post('/api/attendance', {
      classId: 1, date: '2026-09-05', records: [{ id: 22, status: 'absent' }],
    });
    expect(res.status).toBe(403);
    expect(world.writes, 'no attendance row may be written').toEqual([]);
  });

  test('a mixed batch is rejected whole, not partially applied', async () => {
    const res = await api.post('/api/attendance', {
      classId: 1, date: '2026-09-05', records: [{ id: 11, status: 'present' }, { id: 22, status: 'absent' }],
    });
    expect(res.status).toBe(403);
    expect(world.writes, 'the valid half must not land either').toEqual([]);
  });

  test('a legitimate attendance batch still succeeds', async () => {
    const res = await api.post('/api/attendance', {
      classId: 1, date: '2026-09-05', records: [{ id: 11, status: 'present' }],
    });
    expect(res.status).toBe(200);
    expect(world.writes).toHaveLength(1);
    expect(world.writes[0].table).toBe('attendanceRecord');
  });

  test('assignment submissions reject a foreign student', async () => {
    const res = await api.post('/api/assignments/101/submissions', {
      records: [{ studentId: 22, submitted: true, score: 12 }],
    });
    expect(res.status).toBe(403);
    expect(world.writes).toEqual([]);
  });

  test('term scores reject a foreign student, so no score reaches the public lookup', async () => {
    const res = await api.post('/api/term-scores', {
      classId: 1, records: [{ studentId: 22, term: 'final', score: 12, maxScore: 100 }],
    });
    expect(res.status).toBe(403);
    expect(world.writes).toEqual([]);
  });

  test('a malformed student ID fails the batch instead of being dropped', async () => {
    const res = await api.post('/api/attendance', {
      classId: 1, date: '2026-09-05', records: [{ id: 'abc', status: 'present' }],
    });
    expect(res.status).toBe(400);
    expect(world.writes).toEqual([]);
  });
});

test.describe('B05 a scan without a usable student code must not mark anyone', () => {
  let world;
  let api;

  test.beforeEach(async () => {
    world = makeWorld();
    api = await startServer(world);
  });
  test.afterEach(async () => { await api?.close(); });

  for (const [label, body] of [
    ['omitted', { classId: 1 }],
    ['null', { classId: 1, studentCode: null }],
    ['empty', { classId: 1, studentCode: '' }],
    ['numeric', { classId: 1, studentCode: 91001 }],
    ['malformed', { classId: 1, studentCode: '9100' }],
  ]) {
    test(`attendance scan with a ${label} code returns 400 and writes nothing`, async () => {
      const res = await api.post('/api/scan/attendance', body);
      expect(res.status).toBe(400);
      expect(world.writes).toEqual([]);
    });

    test(`materials scan with a ${label} code returns 400 and writes nothing`, async () => {
      const res = await api.post('/api/scan/materials', body);
      expect(res.status).toBe(400);
      expect(world.writes).toEqual([]);
    });
  }

  test('submission scan with an omitted code returns 400 and writes nothing', async () => {
    const res = await api.post('/api/scan/submission', { assignmentId: 101 });
    expect(res.status).toBe(400);
    expect(world.writes).toEqual([]);
  });

  test('a valid code still records the scan', async () => {
    const res = await api.post('/api/scan/attendance', { classId: 1, studentCode: '91001' });
    expect(res.status).toBe(200);
    expect(world.writes).toHaveLength(1);
    expect(world.writes[0].table).toBe('attendanceRecord');
  });
});
