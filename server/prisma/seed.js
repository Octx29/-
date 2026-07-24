import '../lib/env.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

async function main() {
  const passwordHash = await bcrypt.hash('teacher123', 10);

  const teacher = await prisma.teacher.upsert({
    where: { username: 'teacher_somchai' },
    update: {},
    create: {
      username: 'teacher_somchai',
      passwordHash,
      name: 'ครูสมชาย',
      subject: 'คณิตศาสตร์',
    },
  });

  const classDefs = [
    {
      name: 'ม. 1/2',
      subject: 'คณิตศาสตร์พื้นฐาน',
      students: [
        ['10101', 'สมศักดิ์ แซ่ตั้ง'],
        ['10102', 'มานี รักดี'],
        ['10103', 'ปิติ ใจงาม'],
        ['10104', 'ชูใจ ยินดี'],
        ['10105', 'วีระ สุขสวัสดิ์'],
      ],
    },
    {
      name: 'ม. 2/1',
      subject: 'คณิตศาสตร์พื้นฐาน',
      students: [
        ['10201', 'อารีย์ พูลสวัสดิ์'],
        ['10202', 'ธนกร แสงทอง'],
        ['10203', 'กมลชนก ศรีสุข'],
      ],
    },
    {
      name: 'ม. 3/2',
      subject: 'คณิตศาสตร์เพิ่มเติม',
      students: [
        ['10301', 'ณัฐพล เจริญพร'],
        ['10302', 'วรินทร์ ทองดี'],
        ['10303', 'ปวีณา รุ่งเรือง'],
      ],
    },
  ];

  const classRoomsByName = {};

  for (const def of classDefs) {
    let classRoom = await prisma.classRoom.findFirst({ where: { name: def.name, teacherId: teacher.id } });
    if (!classRoom) {
      classRoom = await prisma.classRoom.create({
        data: { name: def.name, subject: def.subject, teacherId: teacher.id },
      });
    }
    classRoomsByName[def.name] = classRoom;

    for (const [studentId, name] of def.students) {
      await prisma.student.upsert({
        where: { studentId },
        update: {},
        create: { studentId, name, classRoomId: classRoom.id },
      });
    }
  }

  // --- Schedule (matches the previous Schedule.jsx mock) ---
  const classRoom12 = classRoomsByName['ม. 1/2'];
  const classRoom21 = classRoomsByName['ม. 2/1'];
  const classRoom32 = classRoomsByName['ม. 3/2'];

  const scheduleDefs = [
    { classRoomId: classRoom12.id, dayOfWeek: 1, startTime: '08:30', endTime: '09:20' }, // Monday
    { classRoomId: classRoom21.id, dayOfWeek: 1, startTime: '10:20', endTime: '11:10' },
    { classRoomId: classRoom32.id, dayOfWeek: 1, startTime: '13:00', endTime: '13:50' },
    { classRoomId: classRoom12.id, dayOfWeek: 2, startTime: '09:20', endTime: '10:10' }, // Tuesday
    { classRoomId: classRoom21.id, dayOfWeek: 2, startTime: '14:40', endTime: '15:30' },
    { classRoomId: classRoom32.id, dayOfWeek: 3, startTime: '10:20', endTime: '11:10' }, // Wednesday
  ];
  for (const slot of scheduleDefs) {
    const existing = await prisma.scheduleSlot.findFirst({ where: slot });
    if (!existing) await prisma.scheduleSlot.create({ data: slot });
  }

  // --- Assignments + submissions for ม. 1/2 ---
  async function upsertAssignment(data) {
    let assignment = await prisma.assignment.findFirst({ where: { classRoomId: data.classRoomId, title: data.title } });
    if (!assignment) assignment = await prisma.assignment.create({ data });
    return assignment;
  }

  const algebraHw = await upsertAssignment({
    classRoomId: classRoom12.id,
    title: 'แบบฝึกหัดพีชคณิต',
    type: 'homework',
    dueDate: '2026-07-23',
    maxScore: 100,
  });
  await upsertAssignment({
    classRoomId: classRoom12.id,
    title: 'เรขาคณิตเบื้องต้น',
    type: 'homework',
    dueDate: '2026-08-05',
    maxScore: 100,
  });
  await upsertAssignment({
    classRoomId: classRoom12.id,
    title: 'งานในชั้นเรียน: แบบฝึกหัดสั้น',
    type: 'in_class',
    dueDate: null,
    maxScore: 20,
  });

  const algebraSubmissions = [
    ['10101', 82],
    ['10102', 45],
    ['10104', 88],
    ['10105', 91],
    // 10103 (ปิติ) intentionally left without a submission to demo the missing-work view
  ];
  for (const [studentId, score] of algebraSubmissions) {
    const student = await prisma.student.findUnique({ where: { studentId } });
    const existing = await prisma.submission.findFirst({ where: { assignmentId: algebraHw.id, studentId: student.id } });
    if (!existing) {
      await prisma.submission.create({
        data: { assignmentId: algebraHw.id, studentId: student.id, submittedAt: new Date(), score },
      });
    }
  }

  // --- Term scores (pre-midterm only, so midterm/final start blank) ---
  const preMidtermScores = [
    ['10101', 78],
    ['10102', 55],
    ['10103', 60],
    ['10104', 88],
    ['10105', 92],
  ];
  for (const [studentId, score] of preMidtermScores) {
    const student = await prisma.student.findUnique({ where: { studentId } });
    await prisma.termScoreEntry.upsert({
      where: { studentId_classRoomId_term: { studentId: student.id, classRoomId: classRoom12.id, term: 'pre_midterm' } },
      update: {},
      create: { studentId: student.id, classRoomId: classRoom12.id, term: 'pre_midterm', score, maxScore: 100 },
    });
  }

  console.log('Seeded: teacher_somchai / teacher123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
