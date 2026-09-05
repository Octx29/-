import { test, expect } from '@playwright/test';
import { syncToSheets } from '../server/services/sheetsSync.js';
import { makeSheetsFixture } from './helpers/sheets-fixture.js';

// SDK shape/atomic-batch unit tests. Real cross-worker PostgreSQL locking is
// verified separately by tests/audit-api.mjs.
function makePrismaStub() {
  const state = { score: 10, present: true };
  const classRoom = { name: 'Class One' };
  const student = { studentId: '91001', name: 'Pupil One', classRoom };
  return {
    state,
    $executeRaw: async () => 0,
    async $transaction(fn) { return fn(this); },
    student: { findMany: async () => [student] },
    attendanceRecord: { findMany: async () => [] },
    termScoreEntry: { findMany: async () => [] },
    submission: { findMany: async () => state.present ? [{ student, assignment: { title: 'Assignment A', classRoom }, submittedAt: new Date(), score: state.score, checkedVia: 'manual' }] : [] },
  };
}

test('B17 overlapping local exports finish with the newest grade', async () => {
  const sheets = makeSheetsFixture(), prisma = makePrismaStub();
  const gate = sheets.holdNextBatch();
  const first = syncToSheets(prisma, { sheets, sheetId: 'fixture' });
  await gate.started;
  prisma.state.score = 90;
  const second = syncToSheets(prisma, { sheets, sheetId: 'fixture' });
  gate.release();
  for (const result of await Promise.all([first,second])) expect(result.ok).toBe(true);
  expect(sheets.tabs.get('Grades')[1][5]).toBe(90);
});

test('B17 a rejected atomic batch preserves every previous tab', async () => {
  const sheets = makeSheetsFixture(), prisma = makePrismaStub();
  await syncToSheets(prisma, { sheets, sheetId: 'fixture' });
  const previous = structuredClone(sheets.tabs);
  prisma.state.score = 90; sheets.failNextBatch();
  expect((await syncToSheets(prisma, { sheets, sheetId: 'fixture' })).ok).toBe(false);
  expect(sheets.tabs).toEqual(previous);
  expect((await syncToSheets(prisma, { sheets, sheetId: 'fixture' })).ok).toBe(true);
  expect(sheets.tabs.get('Grades')[1][5]).toBe(90);
});

test('B17 deleted rows disappear in the replacement batch', async () => {
  const sheets = makeSheetsFixture(), prisma = makePrismaStub();
  await syncToSheets(prisma, { sheets, sheetId: 'fixture' });
  prisma.state.present = false;
  await syncToSheets(prisma, { sheets, sheetId: 'fixture' });
  expect(sheets.tabs.get('Grades')).toHaveLength(1);
});

test('B17 all four tabs publish together without separate clear requests', async () => {
  const sheets = makeSheetsFixture();
  await syncToSheets(makePrismaStub(), { sheets, sheetId: 'fixture' });
  expect(sheets.calls).toHaveLength(1);
  expect(sheets.calls[0].requests.filter(r => r.updateCells)).toHaveLength(4);
});
