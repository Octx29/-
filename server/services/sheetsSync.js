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

async function writeTab(sheets, sheetId, tabName, rows) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `${tabName}!A:Z` });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

// Full-refresh mirror: pulls current DB state and overwrites the Students/Attendance/Grades/TermScores
// tabs. Simplest correct model at this scale - no incremental diffing to get wrong. Never throws:
// callers fire this after a save without letting a Sheets outage break the actual save.
export async function syncToSheets(prisma) {
  const config = getConfig();
  if (!config) {
    console.log('[sheetsSync] not configured (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SHEET_ID missing) - skipping sync');
    return;
  }

  try {
    const sheets = await getSheetsClient(config.credentials);

    const students = await prisma.student.findMany({ include: { classRoom: true }, orderBy: { studentId: 'asc' } });
    await writeTab(sheets, config.sheetId, 'Students', [
      ['รหัสนักเรียน', 'ชื่อ', 'ห้องเรียน'],
      ...students.map((s) => [s.studentId, s.name, s.classRoom.name]),
    ]);

    const attendance = await prisma.attendanceRecord.findMany({
      include: { student: true, classRoom: true },
      orderBy: { date: 'desc' },
    });
    await writeTab(sheets, config.sheetId, 'Attendance', [
      ['วันที่', 'ห้องเรียน', 'รหัสนักเรียน', 'ชื่อ', 'สถานะ', 'วิธีเช็ค'],
      ...attendance.map((a) => [a.date, a.classRoom.name, a.student.studentId, a.student.name, a.status, a.checkedVia]),
    ]);

    const submissions = await prisma.submission.findMany({
      include: { student: true, assignment: { include: { classRoom: true } } },
    });
    await writeTab(sheets, config.sheetId, 'Grades', [
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
    ]);

    const termScores = await prisma.termScoreEntry.findMany({ include: { student: true, classRoom: true } });
    await writeTab(sheets, config.sheetId, 'TermScores', [
      ['ห้องเรียน', 'รหัสนักเรียน', 'ชื่อ', 'ช่วง', 'คะแนน', 'คะแนนเต็ม'],
      ...termScores.map((t) => [t.classRoom.name, t.student.studentId, t.student.name, t.term, t.score, t.maxScore]),
    ]);

    console.log('[sheetsSync] synced Students/Attendance/Grades/TermScores tabs');
  } catch (err) {
    console.error('[sheetsSync] sync failed:', err.message);
  }
}
