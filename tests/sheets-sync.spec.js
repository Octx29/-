import { test, expect } from '@playwright/test';
import { syncToSheets } from '../server/services/sheetsSync.js';

// A local stand-in for the Sheets SDK: it stores tab contents the way the real API
// does (values.update writes from A1 down; values.clear empties a range) so the real
// export code under test is exercised end to end without a live spreadsheet.
function makeSheetsStub() {
  const tabs = new Map();
  const calls = [];
  const gates = new Map();
  const failures = new Map();

  const parse = (range) => {
    const [tab, cells] = range.split('!');
    const from = Number(/^A(\d+)/.exec(cells)?.[1] ?? 1);
    return { tab, from };
  };

  const settle = async (key) => {
    if (gates.has(key)) await gates.get(key).promise;
    const remaining = failures.get(key) ?? 0;
    if (remaining > 0) {
      failures.set(key, remaining - 1);
      throw new Error(`Sheets API failure on ${key}`);
    }
  };

  return {
    tabs,
    calls,
    hold(key) {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      gates.set(key, { promise, release });
      return () => { gates.get(key)?.release(); gates.delete(key); };
    },
    failOnce(key) { failures.set(key, 1); },
    spreadsheets: {
      values: {
        async update({ range, requestBody }) {
          const { tab, from } = parse(range);
          calls.push(`update:${tab}`);
          await settle(`update:${tab}`);
          const rows = tabs.get(tab) ?? [];
          const next = rows.slice();
          requestBody.values.forEach((row, i) => { next[from - 1 + i] = row; });
          tabs.set(tab, next);
        },
        async clear({ range }) {
          const { tab, from } = parse(range);
          calls.push(`clear:${tab}`);
          await settle(`clear:${tab}`);
          tabs.set(tab, (tabs.get(tab) ?? []).slice(0, from - 1));
        },
      },
    },
  };
}

// Minimal Prisma double holding one classroom, one student and one submission score.
function makePrismaStub() {
  const state = { score: 10 };
  const classRoom = { id: 1, name: 'Class One' };
  const student = { id: 11, studentId: '91001', name: 'Pupil One', classRoom };
  return {
    state,
    student: { findMany: async () => [student] },
    attendanceRecord: { findMany: async () => [] },
    termScoreEntry: { findMany: async () => [] },
    submission: {
      findMany: async () => [{
        student,
        assignment: { title: 'Assignment A', classRoom },
        submittedAt: new Date('2026-09-01T00:00:00Z'),
        score: state.score,
        checkedVia: 'manual',
      }],
    },
  };
}

const gradeRow = (sheets) => sheets.tabs.get('Grades')?.[1];

test('B17 an overlapping export cannot publish a stale grade over a newer one', async () => {
  const sheets = makeSheetsStub();
  const prisma = makePrismaStub();
  const release = sheets.hold('update:Students');

  // First save: score 10. Its very first write is held open.
  const first = syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });
  await expect.poll(() => sheets.calls.includes('update:Students')).toBe(true);

  // A second save lands while the first export is still in flight, and it is the
  // newer truth. Before the fix both exports ran concurrently and the older one
  // could finish last, regressing the mirror to 10.
  prisma.state.score = 90;
  const second = syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });

  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  expect(firstResult.ok).toBe(true);
  expect(secondResult.ok).toBe(true);
  expect(gradeRow(sheets)?.[5], 'the mirror must end on the newest grade').toBe(90);
});

test('B17 a failed export leaves the previous mirror intact instead of an empty tab', async () => {
  const sheets = makeSheetsStub();
  const prisma = makePrismaStub();

  const initial = await syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });
  expect(initial.ok).toBe(true);
  expect(sheets.tabs.get('Students')).toHaveLength(2);

  prisma.state.score = 90;
  sheets.failOnce('update:Students');
  const failed = await syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });

  expect(failed.ok).toBe(false);
  expect(sheets.tabs.get('Students'), 'a failed refresh must not empty the tab').toHaveLength(2);
  expect(gradeRow(sheets)?.[5], 'the previous grade survives a failed refresh').toBe(10);

  const recovered = await syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });
  expect(recovered.ok).toBe(true);
  expect(gradeRow(sheets)?.[5]).toBe(90);
});

test('B17 rows removed from the database are cleared from the tab', async () => {
  const sheets = makeSheetsStub();
  const prisma = makePrismaStub();
  await syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });
  expect(sheets.tabs.get('Grades')).toHaveLength(2);

  prisma.submission.findMany = async () => [];
  await syncToSheets(prisma, { sheets, sheetId: 'sheet-1' });
  expect(sheets.tabs.get('Grades'), 'only the header row should remain').toHaveLength(1);
});

test('B17 the tab is written before anything is cleared', async () => {
  const sheets = makeSheetsStub();
  await syncToSheets(makePrismaStub(), { sheets, sheetId: 'sheet-1' });
  expect(sheets.calls.indexOf('update:Students')).toBeLessThan(sheets.calls.indexOf('clear:Students'));
});
