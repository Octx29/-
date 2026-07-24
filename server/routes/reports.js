import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { requireTeacher } from '../middleware/auth.js';
import { ownedClassRoom } from '../lib/authorize.js';
import { getMissingWorkData, getScoreSummaryData } from '../lib/reportData.js';

const router = Router();

async function sendWorkbook(res, filename, buildSheet) {
  const workbook = new ExcelJS.Workbook();
  buildSheet(workbook);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // HTTP headers are Latin-1 only - a raw Thai filename here throws inside Node's http module.
  // RFC 5987 filename* carries the real UTF-8 name; the plain filename is an ASCII-safe fallback.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await workbook.xlsx.write(res);
  res.end();
}

// GET /api/reports/missing-work.xlsx?classId=1
router.get('/missing-work.xlsx', requireTeacher, async (req, res) => {
  const data = await getMissingWorkData(req.teacher.teacherId, req.query.classId);

  await sendWorkbook(res, 'missing-work.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('งานค้างส่ง');
    sheet.columns = [
      { header: 'ห้องเรียน', key: 'className', width: 15 },
      { header: 'ชื่องาน', key: 'title', width: 30 },
      { header: 'กำหนดส่ง', key: 'dueDate', width: 14 },
      { header: 'เลขที่', key: 'roll', width: 10 },
      { header: 'ชื่อนักเรียน', key: 'name', width: 25 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const item of data) {
      for (const student of item.missingStudents) {
        sheet.addRow({
          className: item.className,
          title: item.title,
          dueDate: item.dueDate,
          roll: student.roll,
          name: student.name,
        });
      }
    }
  });
});

// GET /api/reports/score-summary.xlsx?classId=1
router.get('/score-summary.xlsx', requireTeacher, async (req, res) => {
  const data = await getScoreSummaryData(req.teacher.teacherId, req.query.classId);

  await sendWorkbook(res, 'score-summary.xlsx', (workbook) => {
    const sheet = workbook.addWorksheet('สรุปคะแนน');
    sheet.columns = [
      { header: 'ห้องเรียน', key: 'className', width: 15 },
      { header: 'เลขที่', key: 'roll', width: 10 },
      { header: 'ชื่อนักเรียน', key: 'name', width: 25 },
      { header: 'คะแนนงานเฉลี่ย (%)', key: 'avgAssignmentPercent', width: 18 },
      { header: 'งานที่ตรวจแล้ว', key: 'scoredAssignmentCount', width: 14 },
      { header: 'ก่อนกลางภาค', key: 'pre_midterm', width: 14 },
      { header: 'กลางภาค', key: 'midterm', width: 14 },
      { header: 'ปลายภาค', key: 'final', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of data) sheet.addRow(row);
  });
});

// GET /api/reports/custom.xlsx?classId=1&fields=studentId,name,piece1,piece2,midterm&filename=my-report
// fields is a comma-separated list of: studentId, prefix, name, piece1..piece10, preMidterm, midterm, final
router.get('/custom.xlsx', requireTeacher, async (req, res) => {
  const { classId, fields, filename } = req.query;
  if (!classId) return res.status(400).json({ error: 'ต้องระบุ classId' });

  const classRoom = await ownedClassRoom(classId, req.teacher.teacherId);
  if (!classRoom) return res.status(404).json({ error: 'ไม่พบห้องเรียนนี้' });

  const requestedFields = String(fields || '').split(',').filter(Boolean);
  if (requestedFields.length === 0) return res.status(400).json({ error: 'ต้องเลือกอย่างน้อยหนึ่งคอลัมน์' });

  const students = await prisma.student.findMany({
    where: { classRoomId: classRoom.id },
    orderBy: { studentId: 'asc' },
  });
  const assignments = await prisma.assignment.findMany({
    where: { classRoomId: classRoom.id },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: { in: assignments.map((a) => a.id) } },
  });
  const termEntries = await prisma.termScoreEntry.findMany({ where: { classRoomId: classRoom.id } });

  const scoreByStudentAssignment = {};
  for (const s of submissions) scoreByStudentAssignment[`${s.studentId}_${s.assignmentId}`] = s.score;

  const termByStudent = {};
  for (const t of termEntries) {
    termByStudent[t.studentId] = termByStudent[t.studentId] || {};
    termByStudent[t.studentId][t.term] = t.score;
  }

  const columnDefs = {
    studentId: { header: 'เลขประจำตัวนักเรียน', width: 16 },
    prefix: { header: 'คำนำหน้า', width: 12 },
    name: { header: 'ชื่อ-นามสกุล', width: 25 },
    preMidterm: { header: 'ก่อนกลางภาค', width: 14 },
    midterm: { header: 'สอบกลางภาค', width: 14 },
    final: { header: 'สอบปลายภาค', width: 14 },
  };
  for (let i = 1; i <= 10; i++) {
    const assignment = assignments[i - 1];
    columnDefs[`piece${i}`] = { header: assignment ? `ชิ้นงาน ${i}: ${assignment.title}` : `ชิ้นงาน ${i}`, width: 20 };
  }

  const orderedKeys = [
    'studentId',
    'prefix',
    'name',
    ...Array.from({ length: 10 }, (_, i) => `piece${i + 1}`),
    'preMidterm',
    'midterm',
    'final',
  ];
  const selectedKeys = orderedKeys.filter((k) => requestedFields.includes(k));
  if (selectedKeys.length === 0) return res.status(400).json({ error: 'ไม่พบคอลัมน์ที่ถูกต้อง' });

  const termKeyMap = { preMidterm: 'pre_midterm', midterm: 'midterm', final: 'final' };
  const safeName = String(filename || 'รายงาน').replace(/[^\w\-. ฀-๿]/g, '').trim() || 'รายงาน';
  const outFilename = safeName.endsWith('.xlsx') ? safeName : `${safeName}.xlsx`;

  await sendWorkbook(res, outFilename, (workbook) => {
    const sheet = workbook.addWorksheet('รายงาน');
    sheet.columns = selectedKeys.map((k) => ({ header: columnDefs[k].header, key: k, width: columnDefs[k].width }));
    sheet.getRow(1).font = { bold: true };

    for (const student of students) {
      const row = {};
      for (const key of selectedKeys) {
        if (key === 'studentId') row[key] = student.studentId;
        else if (key === 'prefix') row[key] = '';
        else if (key === 'name') row[key] = student.name;
        else if (key.startsWith('piece')) {
          const assignment = assignments[Number(key.replace('piece', '')) - 1];
          row[key] = assignment ? scoreByStudentAssignment[`${student.id}_${assignment.id}`] ?? '' : '';
        } else {
          row[key] = termByStudent[student.id]?.[termKeyMap[key]] ?? '';
        }
      }
      sheet.addRow(row);
    }
  });
});

export default router;
