import { google } from 'googleapis';

const LAST_COLUMN = 'Z';

function getConfig() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!keyJson || !sheetId) return null;

  try {
    return { credentials: JSON.parse(keyJson), sheetId };
  } catch {
    console.error('[sheetsSync] GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON - skipping sync');
    return null;
  }
}

async function getSheetsClient(credentials) {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Publishes a tab without a destructive window.
 *
 * The previous implementation cleared the whole tab and repopulated it in a later
 * request: a failure in between left the tab empty until some later sync happened to
 * succeed. Here the new rows are written first, and only the rows *past* the new data
 * are cleared afterwards. A failed update leaves the previous (stale) mirror intact,
 * which is recoverable; an empty tab is not.
 */
async function writeTab(sheets, sheetId, tabName, rows) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `${tabName}!A${rows.length + 1}:${LAST_COLUMN}`,
  });
}

async function buildTabs(prisma) {
  const students = await prisma.student.findMany({ include: { classRoom: true }, orderBy: { studentId: 'asc' } });
  const attendance = await prisma.attendanceRecord.findMany({
    include: { student: true, classRoom: true },
    orderBy: { date: 'desc' },
  });
  const submissions = await prisma.submission.findMany({
    include: { student: true, assignment: { include: { classRoom: true } } },
  });
  const termScores = await prisma.termScoreEntry.findMany({ include: { student: true, classRoom: true } });

  return [
    ['Students', [
      ['รหัสนักเรียน', 'ชื่อ', 'ห้องเรียน'],
      ...students.map((s) => [s.studentId, s.name, s.classRoom.name]),
    ]],
    ['Attendance', [
      ['วันที่', 'ห้องเรียน', 'รหัสนักเรียน', 'ชื่อ', 'สถานะ', 'วิธีเช็ค'],
      ...attendance.map((a) => [a.date, a.classRoom.name, a.student.studentId, a.student.name, a.status, a.checkedVia]),
    ]],
    ['Grades', [
      ['ห้องเรียน', 'ชื่องาน', 'รหัสนักเรียน', 'ชื่อ', 'ส่งแล้ว', 'คะแนน', 'วิธีเช็ค'],
      ...submissions.map((s) => [
        s.assignment.classRoom.name,
        s.assignment.title,
        s.student.studentId,
        s.student.name,
        s.submittedAt ? 'ใช่' : 'ไม่',
        s.score ?? '',
        s.checkedVia,
      ]),
    ]],
    ['TermScores', [
      ['ห้องเรียน', 'รหัสนักเรียน', 'ชื่อ', 'ช่วง', 'คะแนน', 'คะแนนเต็ม'],
      ...termScores.map((t) => [t.classRoom.name, t.student.studentId, t.student.name, t.term, t.score, t.maxScore]),
    ]],
  ];
}

async function runSync(prisma, overrides) {
  const sheetId = overrides.sheetId ?? null;
  let sheets = overrides.sheets ?? null;
  let targetSheetId = sheetId;

  if (!sheets) {
    const config = getConfig();
    if (!config) {
      console.log('[sheetsSync] not configured (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SHEET_ID missing) - skipping sync');
      return { ok: true, skipped: true };
    }
    sheets = await getSheetsClient(config.credentials);
    targetSheetId = config.sheetId;
  }

  try {
    // Read the database inside the job, not before it was queued. Because jobs are
    // serialised, the last job to run always publishes the newest state - an older
    // overlapping save can no longer overwrite a newer one.
    const tabs = await buildTabs(prisma);
    for (const [tabName, rows] of tabs) {
      await writeTab(sheets, targetSheetId, tabName, rows);
    }
    lastFailure = null;
    console.log('[sheetsSync] synced Students/Attendance/Grades/TermScores tabs');
    return { ok: true, skipped: false };
  } catch (err) {
    // Never throw: a Sheets outage must not fail the teacher's save. The failure is
    // recorded so a later sync (or an operator) can tell the mirror is behind.
    lastFailure = { at: new Date(), message: err.message };
    console.error('[sheetsSync] sync failed:', err.message);
    return { ok: false, error: err.message };
  }
}

let lastFailure = null;
let running = Promise.resolve();
let queued = null;

/** Returns the last sync failure, or null when the mirror is believed current. */
export function lastSyncFailure() {
  return lastFailure;
}

/**
 * Full-refresh mirror of the Students/Attendance/Grades/TermScores tabs.
 *
 * Calls are serialised and coalesced. Two saves that overlap used to interleave their
 * clear/update requests against the same spreadsheet, so an older export could land
 * after a newer one and regress the mirror. Now at most one export runs at a time, and
 * concurrent callers share the single pending job that will read the database after
 * every in-flight write has settled.
 *
 * `overrides` ({ sheets, sheetId }) exists for tests, which drive the real export code
 * against a local Sheets SDK stub.
 */
export function syncToSheets(prisma, overrides = {}) {
  if (queued) return queued;

  const job = running.then(() => {
    queued = null;
    return runSync(prisma, overrides);
  });
  queued = job;
  running = job.then(
    () => undefined,
    () => undefined
  );
  return job;
}
