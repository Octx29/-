import { prisma } from './prisma.js';
import { normaliseStudentIds, validStudentCode } from './validation.js';

// Re-exported so route modules keep importing their authorization helpers from one place.
export { normaliseStudentIds, validStudentCode };

/** Confirms the classroom exists and belongs to this teacher. Returns the classroom or null. */
export async function ownedClassRoom(classRoomId, teacherId) {
  const classRoom = await prisma.classRoom.findFirst({
    where: { id: Number(classRoomId), teacherId },
  });
  return classRoom;
}

/** Confirms the assignment exists and its classroom belongs to this teacher. Returns the assignment or null. */
export async function ownedAssignment(assignmentId, teacherId) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: Number(assignmentId), classRoom: { teacherId } },
  });
  return assignment;
}

/**
 * Confirms every student ID in the batch is enrolled in this classroom.
 *
 * Owning the classroom is not the same as owning the students named in the request body:
 * without this check an authenticated teacher can post another teacher's student IDs
 * against their own classroom and write to those foreign records. Membership is verified
 * for every ID in one query, and the caller rejects the entire batch on any mismatch.
 */
export async function studentsInClassRoom(studentIds, classRoomId) {
  if (studentIds.length === 0) return { ok: true, foreign: [] };
  const enrolled = await prisma.student.findMany({
    where: { id: { in: studentIds }, classRoomId: Number(classRoomId) },
    select: { id: true },
  });
  const enrolledIds = new Set(enrolled.map((s) => s.id));
  const foreign = studentIds.filter((id) => !enrolledIds.has(id));
  return { ok: foreign.length === 0, foreign };
}

/**
 * Validates a write batch against one classroom in a single place.
 * Returns null when the batch is safe to apply, or a { status, body } error
 * response describing why the whole batch must be rejected.
 */
export async function assertBatchBelongsToClassRoom(rawIds, classRoomId) {
  const { ids, invalid } = normaliseStudentIds(rawIds);
  if (invalid.length > 0) {
    return { status: 400, body: { error: 'รหัสนักเรียนในคำขอไม่ถูกต้อง' } };
  }
  const { ok, foreign } = await studentsInClassRoom(ids, classRoomId);
  if (!ok) {
    return { status: 403, body: { error: 'มีนักเรียนที่ไม่ได้อยู่ในห้องเรียนนี้ ไม่บันทึกทั้งชุด', foreign } };
  }
  return null;
}
