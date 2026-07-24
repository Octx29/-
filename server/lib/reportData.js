import { prisma } from './prisma.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Assignments past due with at least one student who hasn't submitted, for one teacher (optionally one class).
export async function getMissingWorkData(teacherId, classId) {
  const assignments = await prisma.assignment.findMany({
    where: {
      classRoom: { teacherId, ...(classId ? { id: Number(classId) } : {}) },
      dueDate: { not: null, lte: todayIso() },
    },
    include: {
      classRoom: { select: { id: true, name: true } },
      submissions: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  const result = [];
  for (const a of assignments) {
    const students = await prisma.student.findMany({ where: { classRoomId: a.classRoomId } });
    const submittedIds = new Set(a.submissions.filter((s) => s.submittedAt).map((s) => s.studentId));
    const missingStudents = students.filter((s) => !submittedIds.has(s.id));
    if (missingStudents.length > 0) {
      result.push({
        assignmentId: a.id,
        title: a.title,
        dueDate: a.dueDate,
        className: a.classRoom.name,
        missingStudents: missingStudents.map((s) => ({ id: s.id, roll: s.studentId, name: s.name })),
      });
    }
  }
  return result;
}

const TERMS = ['pre_midterm', 'midterm', 'final'];

// Per-student roll-up: average assignment score (%) + each term exam score, for one teacher (optionally one class).
export async function getScoreSummaryData(teacherId, classId) {
  const classRooms = await prisma.classRoom.findMany({
    where: { teacherId, ...(classId ? { id: Number(classId) } : {}) },
    include: {
      students: true,
    },
  });

  const rows = [];
  for (const classRoom of classRooms) {
    for (const student of classRoom.students) {
      const submissions = await prisma.submission.findMany({
        where: { studentId: student.id, assignment: { classRoomId: classRoom.id }, score: { not: null } },
        include: { assignment: { select: { maxScore: true } } },
      });
      const scoredCount = submissions.length;
      const avgPercent = scoredCount
        ? Math.round(
            (submissions.reduce((sum, s) => sum + s.score / s.assignment.maxScore, 0) / scoredCount) * 1000
          ) / 10
        : null;

      const termEntries = await prisma.termScoreEntry.findMany({
        where: { studentId: student.id, classRoomId: classRoom.id },
      });
      const byTerm = {};
      for (const term of TERMS) {
        const entry = termEntries.find((e) => e.term === term);
        byTerm[term] = entry ? entry.score : null;
      }

      rows.push({
        className: classRoom.name,
        roll: student.studentId,
        name: student.name,
        avgAssignmentPercent: avgPercent,
        scoredAssignmentCount: scoredCount,
        ...byTerm,
      });
    }
  }
  return rows;
}
