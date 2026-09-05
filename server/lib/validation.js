// Pure request-shape validation. Deliberately free of database imports so it can be
// unit-tested without a generated Prisma client or a live database.

/** Student IDs are the 5-digit public codes printed on the QR cards. */
const STUDENT_CODE_PATTERN = /^\d{5}$/;

/**
 * Normalises a batch of client-supplied student database IDs.
 * Returns { ids, invalid }: `invalid` holds every raw value that is not a positive
 * integer. Callers must reject the whole batch when `invalid` is non-empty - silently
 * dropping bad rows makes a partially applied write look like a full success.
 */
export function normaliseStudentIds(rawIds) {
  const ids = [];
  const invalid = [];
  for (const raw of rawIds) {
    const id = Number(raw);
    if (raw === null || raw === undefined || raw === '' || !Number.isInteger(id) || id <= 0) {
      invalid.push(raw);
      continue;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, invalid };
}

/**
 * Validates a QR / manual scan code before it reaches the database.
 * An absent or malformed code must be a 400, never a query whose student filter
 * disappears and matches an arbitrary first student in the classroom.
 * Returns the trimmed code, or null when the input is unusable.
 */
export function validStudentCode(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const code = rawCode.trim();
  if (!STUDENT_CODE_PATTERN.test(code)) return null;
  return code;
}
