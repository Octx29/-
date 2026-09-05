import { google } from 'googleapis';

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

// Replace all mirror values in one atomic request, including obsolete rows.
async function publishTabs(sheets, sheetId, tabs) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' }, { timeout: 10000, retry: false });
  const requests = [];
  for (const [title, rows] of tabs) {
    const properties = metadata.data.sheets.find(s => s.properties.title === title)?.properties;
    if (!properties) throw new Error(`Missing mirror tab: ${title}`);
    const rowCount = Math.max(properties.gridProperties.rowCount, rows.length);
    const columnCount = Math.max(properties.gridProperties.columnCount, 26);
    requests.push({ updateSheetProperties: {
      properties: { sheetId: properties.sheetId, gridProperties: { rowCount, columnCount } },
      fields: 'gridProperties.rowCount,gridProperties.columnCount',
    } });
    requests.push({ updateCells: {
      range: { sheetId: properties.sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 26 },
      rows: rows.map(row => ({ values: row.map(value => ({ userEnteredValue:
        typeof value === 'number' ? { numberValue: value } : { stringValue: String(value ?? '') },
      })) })), fields: 'userEnteredValue',
    } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } }, { timeout: 10000, retry: false });
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
        s.submittedAt ? s.score ?? '' : '',
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

  try {
  if (!sheets) {
    const config = getConfig();
    if (!config) {
      console.log('[sheetsSync] not configured (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SHEET_ID missing) - skipping sync');
      return { ok: true, skipped: true };
    }
    sheets = await getSheetsClient(config.credentials);
    targetSheetId = config.sheetId;
  }

    // Coordinate separate serverless workers through PostgreSQL. Read only after
    // acquiring the lock, and hold it until the external publish settles.
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sheet-mirror:${targetSheetId}`}))`;
      const tabs = await buildTabs(tx);
      await publishTabs(sheets, targetSheetId, tabs);
    }, { maxWait: 30000, timeout: 60000 });
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
 * after a newer one and regress the mirror. Database locking also protects separate workers. Within this process,
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
