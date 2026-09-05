// Preserve the first submission time atomically, including concurrent QR scans.
// A manual edit records its provenance; unchecking explicitly clears the grade.
export function saveSubmission(db, assignmentId, studentId, submitted, score, checkedVia = 'manual') {
  const timestamp = submitted ? new Date() : null;
  return db.$executeRaw`
    INSERT INTO "Submission" ("assignmentId", "studentId", "submittedAt", "score", "checkedVia")
    VALUES (${assignmentId}, ${studentId}, ${timestamp}, ${submitted ? score : null}, ${checkedVia})
    ON CONFLICT ("assignmentId", "studentId") DO UPDATE SET
      "submittedAt" = CASE WHEN ${submitted} THEN COALESCE("Submission"."submittedAt", EXCLUDED."submittedAt") ELSE NULL END,
      "score" = CASE WHEN ${checkedVia} = 'qr' THEN "Submission"."score" ELSE EXCLUDED."score" END,
      "checkedVia" = EXCLUDED."checkedVia"
  `;
}
