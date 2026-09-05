import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an empty disposable PostgreSQL database');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'audit-local-only';
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = '';
process.env.GOOGLE_SHEET_ID = '';
process.env.LINE_CHANNEL_ACCESS_TOKEN = '';
const { default: app } = await import('../server/app.js');
const { prisma } = await import('../server/lib/prisma.js');
const { signSession } = await import('../server/middleware/auth.js');
const { getScoreSummaryData, getMissingWorkData } = await import('../server/lib/reportData.js');
const { runReminders } = await import('../server/lib/reminders.js');
const result = [];
const teachers = [], rooms = [], students = [], assignments = [];
const runId = Date.now();
let http;
async function probe(id, fn) {
  try { const observed = await fn(); result.push({ id, status: 'passed', observed }); }
  catch (error) { result.push({ id, status: 'failed', error: error.message }); }
  console.log(JSON.stringify(result.at(-1)));
}
async function addAssignment(room, extra = {}) {
  const a = await prisma.assignment.create({ data: { classRoomId: room.id, title: `Audit ${assignments.length}`, type: 'homework', ...extra } });
  assignments.push(a); return a;
}
const RealDate = Date;
async function at(iso, fn) {
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [iso])); }
    static now() { return new RealDate(iso).getTime(); }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
try {
  if (await prisma.teacher.count()) throw new Error('Integration suite requires an empty database');
  for (let i = 0; i < 2; i++) teachers.push(await prisma.teacher.create({ data: {
    username: `audit-${runId}-${i}`, passwordHash: 'not-used', name: `Audit Teacher ${i}`, subject: 'Math',
  } }));
  for (let i = 0; i < 3; i++) rooms.push(await prisma.classRoom.create({ data: {
    name: `Audit Class ${i}`, subject: 'Math', teacherId: teachers[i === 2 ? 1 : 0].id, lineGroupId: 'local-fake-group',
  } }));
  for (let i = 0; i < 3; i++) students.push(await prisma.student.create({ data: {
    studentId: String(91000 + i), name: `Audit Pupil ${i}`, classRoomId: rooms[i].id,
  } }));
  http = app.listen(0, '127.0.0.1'); await once(http, 'listening');
  const base = `http://127.0.0.1:${http.address().port}/api`;
  const cookie = `session=${signSession(teachers[0])}`;
  const req = async (path, data, auth = true) => {
    const r = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  await probe('B01', async () => {
    const victim = await prisma.attendanceRecord.create({ data: { studentId: students[2].id, classRoomId: rooms[2].id, date: '2026-09-05', status: 'present' } });
    const a = await addAssignment(rooms[0]);
    const cases = [];
    for (const foreign of [students[1], students[2]]) {
      for (const [path, body] of [
        ['/attendance', { classId: rooms[0].id, date: '2026-09-05', records: [{ id: students[0].id, status: 'absent' }, { id: foreign.id, status: 'absent' }] }],
        [`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: true, score: 80 }, { studentId: foreign.id, submitted: true, score: 12 }] }],
        ['/term-scores', { classId: rooms[0].id, records: [{ studentId: students[0].id, term: 'final', score: 80 }, { studentId: foreign.id, term: 'final', score: 12 }] }],
      ]) {
        const response = await req(path, body); assert.equal(response.status, 403);
        cases.push({ path, foreignClass: foreign.classRoomId, HTTP: response.status });
      }
    }
    assert.equal((await prisma.attendanceRecord.findUnique({ where: { id: victim.id } })).status, 'present');
    assert.equal(await prisma.attendanceRecord.count({ where: { studentId: students[0].id } }), 0);
    assert.equal(await prisma.submission.count({ where: { assignmentId: a.id } }), 0);
    assert.equal(await prisma.termScoreEntry.count({ where: { classRoomId: rooms[0].id } }), 0);
    for (const [path, body] of [
      ['/attendance', { classId: rooms[0].id, date: '2026-09-05', records: [{ id: students[0].id, status: 'present' }] }],
      [`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: true, score: 80 }] }],
      ['/term-scores', { classId: rooms[0].id, records: [{ studentId: students[0].id, term: 'final', score: 80 }] }],
    ]) assert.equal((await req(path, body)).status, 200);
    assert.equal((await prisma.submission.findFirst({ where: { assignmentId: a.id } })).score, 80);
    await prisma.submission.deleteMany({ where: { assignmentId: a.id } });
    return { realPostgreSQL: true, rejectedMixedBatches: cases, noPartialWrites: true, legitimateSaves: 'all three succeeded' };
  });
  await probe('B05', async () => {
    const a = await addAssignment(rooms[1]); let checked = 0;
    for (const code of [undefined, null, '', '    ', 91001, {}, [], '9100', '910011', '9100a']) {
      for (const [path, body] of [
        ['/scan/attendance', { classId: rooms[1].id }],
        ['/scan/submission', { assignmentId: a.id }],
        ['/scan/materials', { classId: rooms[1].id }],
      ]) { assert.equal((await req(path, { ...body, studentCode: code })).status, 400); checked++; }
    }
    assert.equal(await prisma.attendanceRecord.count({ where: { studentId: students[1].id } }), 0);
    assert.equal(await prisma.submission.count({ where: { assignmentId: a.id } }), 0);
    assert.equal(await prisma.materialsCheck.count({ where: { studentId: students[1].id } }), 0);
    for (const [path, body] of [
      ['/scan/attendance', { classId: rooms[1].id }],
      ['/scan/submission', { assignmentId: a.id }],
      ['/scan/materials', { classId: rooms[1].id }],
    ]) assert.equal((await req(path, { ...body, studentCode: students[1].studentId })).status, 200);
    return { realPostgreSQL: true, invalidScansRejected: checked, noAccidentalWrites: true, legitimateScans: 'all three succeeded' };
  });
  await probe('B06', async () => {
    await req('/term-scores', { classId: rooms[0].id, records: [{ studentId: students[0].id, term: 'midterm', score: 88 }] });
    const clear = await req('/term-scores', { classId: rooms[0].id, records: [{ studentId: students[0].id, term: 'midterm', score: '' }] });
    const read = await req(`/term-scores?classId=${rooms[0].id}`);
    assert.equal(read.body[0].midterm, null);
    return { clearHTTP: clear.status, afterClearAndReload: read.body[0].midterm };
  });
  await probe('B07', async () => {
    const a = await addAssignment(rooms[0]);
    await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: false, score: null }] });
    const list = await req(`/assignments?classId=${rooms[0].id}`);
    const roster = await req(`/assignments/${a.id}/submissions`);
    const summary = list.body.find(x => x.id === a.id);
    assert.equal(summary.submittedCount, 0); assert.equal(roster.body.roster[0].submitted, false);
    return { displayedSubmittedCount: summary.submittedCount, totalStudents: summary.totalStudents, actuallySubmitted: false };
  });
  await probe('B08', async () => {
    const a = await addAssignment(rooms[1]); let rejected = 0;
    for (const score of [-5, 101, 'abc', true, {}, 1.5]) {
      assert.equal((await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[1].id, submitted: true, score }] })).status, 400); rejected++;
    }
    for (const maxScore of [0, '0', -1, 'abc', true, 1.5]) {
      assert.equal((await req('/assignments', { classId: rooms[1].id, title: 'Invalid maximum', type: 'quiz', maxScore })).status, 400); rejected++;
    }
    for (const [score, maxScore] of [[999,100],[-1,100],[5,0],['bad',100]]) {
      assert.equal((await req('/term-scores', { classId: rooms[1].id, records: [{ studentId: students[1].id, term: 'final', score, maxScore }] })).status, 400); rejected++;
    }
    assert.equal((await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[1].id, submitted: true, score: 0 }] })).status, 200);
    return { invalidInputsRejected: rejected, zeroScoreAccepted: true };
  });
  await probe('B09', async () => {
    const a = await addAssignment(rooms[0]);
    await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: true, score: 80 }] });
    await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: false, score: 80 }] });
    const roster = await req(`/assignments/${a.id}/submissions`);
    const summary = (await getScoreSummaryData(teachers[0].id, rooms[0].id))[0];
    assert.equal(roster.body.roster[0].submitted, false); assert.equal(summary.avgAssignmentPercent, null); assert.equal(roster.body.roster[0].score, null);
    return { submitted: false, retainedScore: roster.body.roster[0].score, scoreSummaryPercent: summary.avgAssignmentPercent, scoredAssignmentCount: summary.scoredAssignmentCount };
  });
  await probe('B10', async () => at('2026-09-05T18:30:00Z', async () => {
    const scan = await req('/scan/attendance', { classId: rooms[0].id, studentCode: students[0].studentId });
    const records = await prisma.attendanceRecord.findMany({ where: { studentId: students[0].id } });
    assert.equal(scan.status, 200); assert(records.some(r => r.date === '2026-09-06'));
    const dashboard = await req('/dashboard'); assert.equal(dashboard.body.find(c => c.id === rooms[0].id).attendanceRate, 100);
    return { bangkokTime: '2026-09-06 01:30', savedDate: '2026-09-06', correctDate: '2026-09-06' };
  }));
  await probe('B11', async () => at('2026-09-05T03:00:00Z', async () => {
    const a = await addAssignment(rooms[0], { dueDate: '2026-09-05' });
    const missing = await getMissingWorkData(teachers[0].id, rooms[0].id);
    assert(!missing.some(x => x.assignmentId === a.id));
    return { bangkokTime: '2026-09-05 10:00', dueDate: a.dueDate, listedAsOverdue: false };
  }));
  await probe('B12-B14', async () => at('2026-09-05T03:00:00Z', async () => {
    const a = await addAssignment(rooms[0], { dueDate: '2026-09-06' });
    const where = { assignmentId_kind: { assignmentId: a.id, kind: 'due_tomorrow' } };
    await runReminders(); assert.equal(await prisma.reminderLog.findUnique({ where }), null);
    const originalFetch = globalThis.fetch; const calls = []; let fail = true;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'synthetic-token';
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.line.me/')) return originalFetch(url, options);
      calls.push({ key: options.headers['X-Line-Retry-Key'], payload: options.body });
      return new Response('{}', { status: fail ? 503 : 200 });
    };
    try {
      await runReminders(); const pending = await prisma.reminderLog.findUnique({ where });
      assert.equal(pending.status, 'pending'); assert.equal(pending.sentAt, null);
      fail = false; await runReminders();
      const sent = await prisma.reminderLog.findUnique({ where }); assert.equal(sent.status, 'sent');
      const retried = calls.filter(c => c.key === pending.retryKey); assert.equal(retried.length, 2); assert.equal(retried[0].payload, retried[1].payload);
      const count = calls.length; await runReminders(); assert.equal(calls.length, count);
      const concurrent = await addAssignment(rooms[0], { dueDate: '2026-09-06' });
      let signal, release; const started = new Promise(r => { signal = r; }); const gate = new Promise(r => { release = r; });
      let attempts = 0;
      globalThis.fetch = async () => { attempts++; signal(); await gate; return new Response('{}', { status: 200 }); };
      const first = runReminders(); await started;
      const second = runReminders();
      // Keep the provider response pending long enough for the second worker to
      // contend on the durable lock, then release both without timing assertions.
      await new Promise(r => setTimeout(r, 100)); release();
      await Promise.all([first, second]); assert.equal(attempts, 1);
      assert.equal(await prisma.reminderLog.count({ where: { assignmentId: concurrent.id, status: 'sent' } }), 1);
      const missed = await addAssignment(rooms[0], { dueDate: '2026-09-03' });
      globalThis.fetch = async () => new Response('{}', { status: 200 });
      await runReminders();
      assert.equal(await prisma.reminderLog.count({ where: { assignmentId: missed.id, kind: 'expired', status: 'sent' } }), 1);
      return { skippedNotLogged: true, failedDeliveryRetriedWithSameKey: true, concurrentPushes: attempts, missedRunCaughtUp: true };
    } finally { globalThis.fetch = originalFetch; process.env.LINE_CHANNEL_ACCESS_TOKEN = ''; }
  }));
  await probe('B16', async () => {
    const a = await addAssignment(rooms[0]);
    const original = new Date('2026-09-01T01:00:00Z');
    await prisma.submission.create({ data: { studentId: students[0].id, assignmentId: a.id, submittedAt: original, score: 50, checkedVia: 'qr' } });
    await req(`/assignments/${a.id}/submissions`, { records: [{ studentId: students[0].id, submitted: true, score: 51 }] });
    const after = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: students[0].id } } });
    assert.equal(after.submittedAt.getTime(), original.getTime()); assert.equal(after.checkedVia, 'manual');
    await req('/scan/submission', { assignmentId: a.id, studentCode: students[0].studentId });
    const rescanned = await prisma.submission.findUnique({ where: { id: after.id } }); assert.equal(rescanned.submittedAt.getTime(), original.getTime()); assert.equal(rescanned.score, 51);
    return { originalSubmission: original.toISOString(), afterEditingScore: after.submittedAt.toISOString(), checkedViaAfterManualEdit: after.checkedVia };
  });
  await probe('B17', async () => {
    const a = await addAssignment(rooms[0]);
    const sub = await prisma.submission.create({ data: { assignmentId: a.id, studentId: students[0].id, submittedAt: new Date(), score: 10 } });
    const { makeSheetsFixture } = await import('./helpers/sheets-fixture.js');
    const sheets = makeSheetsFixture();
    const workerA = await import('../server/services/sheetsSync.js?worker=A');
    const workerB = await import('../server/services/sheetsSync.js?worker=B');
    const gate = sheets.holdNextBatch();
    const first = workerA.syncToSheets(prisma, { sheets, sheetId: 'synthetic-shared-sheet' });
    await gate.started;
    await prisma.submission.update({ where: { id: sub.id }, data: { score: 90 } });
    const second = workerB.syncToSheets(prisma, { sheets, sheetId: 'synthetic-shared-sheet' });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(sheets.calls.length, 1, 'the second worker must wait for the database lock');
    gate.release();
    for (const outcome of await Promise.all([first, second])) assert.equal(outcome.ok, true);
    assert.equal(sheets.tabs.get('Grades').find(row => row[1] === a.title)[5], 90);
    const previous = structuredClone(sheets.tabs);
    sheets.failNextBatch();
    assert.equal((await workerA.syncToSheets(prisma, { sheets, sheetId: 'synthetic-shared-sheet' })).ok, false);
    assert.deepEqual(sheets.tabs, previous);
    return { realPostgreSQLLock: true, independentlyInstantiatedWorkers: 2, finalMirrorScore: 90, rejectedBatchPreservesMirror: true };
  });
  await probe('B20', async () => {
    await prisma.student.update({ where: { id: students[0].id }, data: { name: 'ทดสอบ', prefix: 'นาย' } });
    const response = await fetch(`${base}/reports/custom.xlsx?classId=${rooms[0].id}&fields=prefix,name`, { headers: { Cookie: cookie } });
    const { default: ExcelJS } = await import('../node_modules/exceljs/excel.js');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
    const row = book.worksheets[0].getRow(2);
    assert.equal(row.getCell(1).value, 'นาย'); assert.equal(row.getCell(2).value, 'ทดสอบ');
    await prisma.student.update({ where: { id: students[0].id }, data: { name: 'Audit Pupil 0' } });
    return { selectedFields: ['prefix', 'name'], prefixCell: row.getCell(1).value, nameCell: row.getCell(2).value };
  });
} finally {
  globalThis.Date = RealDate;
  if (http) await new Promise(resolve => http.close(resolve));
  const ids = assignments.map(a => a.id).filter(Boolean);
  const sids = students.map(s => s.id);
  await prisma.reminderLog.deleteMany({ where: { assignmentId: { in: ids } } });
  await prisma.submission.deleteMany({ where: { studentId: { in: sids } } });
  await prisma.termScoreEntry.deleteMany({ where: { studentId: { in: sids } } });
  await prisma.attendanceRecord.deleteMany({ where: { studentId: { in: sids } } });
  await prisma.materialsCheck.deleteMany({ where: { studentId: { in: sids } } });
  await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: sids } } });
  await prisma.classRoom.deleteMany({ where: { id: { in: rooms.map(r => r.id) } } });
  await prisma.teacher.deleteMany({ where: { id: { in: teachers.map(t => t.id) } } });
  await prisma.$disconnect();
  if (process.env.AUDIT_RESULT_PATH) writeFileSync(process.env.AUDIT_RESULT_PATH, JSON.stringify(result, null, 2));
  if (result.some(r => r.status === 'failed')) process.exitCode = 1;
}
