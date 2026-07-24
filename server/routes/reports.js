import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireTeacher } from '../middleware/auth.js';
import { getMissingWorkData, getScoreSummaryData } from '../lib/reportData.js';

const router = Router();

async function sendWorkbook(res, filename, buildSheet) {
  const workbook = new ExcelJS.Workbook();
  buildSheet(workbook);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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

export default router;
