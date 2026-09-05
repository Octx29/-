import { test, expect } from '@playwright/test';
import { normaliseStudentIds, validStudentCode } from '../server/lib/validation.js';

// B05 - a missing or malformed QR student code used to reach Prisma as `undefined`.
// Prisma omits an undefined filter, so findFirst fell back to the classroom filter
// alone and marked an arbitrary first student.
test.describe('B05 scan code validation', () => {
  test('rejects every input that would drop the studentId filter', () => {
    for (const bad of [undefined, null, '', '   ', 91001, {}, [], '9100', '910011', '9100a', 'null']) {
      expect(validStudentCode(bad), `${JSON.stringify(bad)} must not be accepted`).toBeNull();
    }
  });

  test('accepts a well-formed five-digit code and trims surrounding whitespace', () => {
    expect(validStudentCode('91001')).toBe('91001');
    expect(validStudentCode('  91001 \n')).toBe('91001');
  });
});

// B01 - bulk write bodies carry client-supplied student database IDs. Anything that is
// not a positive integer must fail the whole batch rather than being quietly dropped.
test.describe('B01 batch student ID normalisation', () => {
  test('accepts positive integers and de-duplicates them', () => {
    expect(normaliseStudentIds([3, '4', 3])).toEqual({ ids: [3, 4], invalid: [] });
  });

  test('reports every unusable ID instead of silently skipping it', () => {
    const { ids, invalid } = normaliseStudentIds([1, 0, -2, 'abc', null, undefined, '', 1.5, NaN]);
    expect(ids).toEqual([1]);
    expect(invalid).toEqual([0, -2, 'abc', null, undefined, '', 1.5, NaN]);
  });

  test('an empty batch is valid and produces no IDs', () => {
    expect(normaliseStudentIds([])).toEqual({ ids: [], invalid: [] });
  });
});
