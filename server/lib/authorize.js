import { prisma } from './prisma.js';

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
