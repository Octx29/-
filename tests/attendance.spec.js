import { test as base, expect } from '@playwright/test';

const classes = [
  { id: 1, name: 'Class One', subject: 'Mathematics' },
  { id: 2, name: 'Class Two', subject: 'Mathematics' },
];

// Rosters are disjoint on purpose: a row rendered under the wrong classroom is
// immediately visible, and a write carrying a foreign student ID is unambiguous.
const rosters = {
  1: [{ id: 11, roll: '1', name: 'Pupil One', status: 'present' }],
  2: [{ id: 22, roll: '1', name: 'Pupil Two', status: 'absent' }],
};

const test = base.extend({
  backend: async ({ page }, provide) => {
    const writes = [];
    const requests = [];
    const gates = new Map();
    const failures = new Set();

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${url.pathname}${url.search}`;
      requests.push({ key, method: request.method() });

      if (url.pathname === '/api/attendance' && request.method() === 'POST') {
        writes.push(request.postDataJSON());
        await route.fulfill({ json: { ok: true } });
        return;
      }

      let response;
      if (url.pathname === '/api/auth/me') response = { id: 1, name: 'Test Teacher', subject: 'Mathematics' };
      else if (url.pathname === '/api/dashboard') response = [];
      else if (url.pathname === '/api/classes') response = classes;
      else if (url.pathname === '/api/attendance') response = rosters[Number(url.searchParams.get('classId'))] ?? [];
      else throw new Error(`Unexpected API request: ${request.method()} ${key}`);

      if (gates.has(key)) await gates.get(key).promise;
      if (failures.has(key)) await route.fulfill({ status: 503, json: { error: 'Cannot load roster' } });
      else await route.fulfill({ json: response });
    });

    const backend = {
      writes,
      requests,
      hold(key) {
        let release;
        const promise = new Promise((resolve) => { release = resolve; });
        gates.set(key, { promise, release });
      },
      release(key) { gates.get(key)?.release(); gates.delete(key); },
      fail(key) { failures.add(key); },
      attendanceKey(classId) {
        const request = requests.find((r) => r.key.startsWith(`/api/attendance?classId=${classId}&`));
        return request?.key ?? null;
      },
    };
    try {
      await provide(backend);
    } finally {
      for (const gate of gates.values()) gate.release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  },
});

const today = new Date().toISOString().slice(0, 10);
const key = (classId) => `/api/attendance?classId=${classId}&date=${today}`;
const saveButton = (page) => page.getByRole('button', { name: 'บันทึก', exact: true });
const classSelect = (page) => page.getByRole('combobox').first();

async function openAttendance(page) {
  await page.goto('/');
  await page.locator('.nav-links').getByText('เช็คชื่อเข้าเรียน', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'เช็คชื่อเข้าเรียน' })).toBeVisible();
}

test('B03 a late roster response cannot replace the newly selected classroom', async ({ page, backend }) => {
  backend.hold(key(1));
  await openAttendance(page);
  await expect.poll(() => backend.requests.some((r) => r.key === key(1))).toBe(true);

  await classSelect(page).selectOption('2');
  await expect(page.getByText('Pupil Two', { exact: true })).toBeVisible();

  // Release classroom 1's response after classroom 2 is on screen. Before the fix every
  // response called setStudents unconditionally, so classroom 1's pupil reappeared under
  // classroom 2 and Save then posted that foreign student ID with classId=2.
  const late = page.waitForResponse((response) => response.url().includes(key(1)));
  backend.release(key(1));
  await late;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await expect(page.getByText('Pupil Two', { exact: true })).toBeVisible();
  await expect(page.getByText('Pupil One', { exact: true })).toHaveCount(0);

  await saveButton(page).click();
  await expect.poll(() => backend.writes.length).toBe(1);
  expect(backend.writes[0].classId).toBe(2);
  expect(backend.writes[0].records.map((r) => r.id)).toEqual([22]);
});

test('B03 saving is refused while the selected classroom roster is still loading', async ({ page, backend }) => {
  await openAttendance(page);
  await expect(page.getByText('Pupil One', { exact: true })).toBeVisible();

  backend.hold(key(2));
  await classSelect(page).selectOption('2');
  await expect.poll(() => backend.requests.some((r) => r.key === key(2))).toBe(true);

  await expect(saveButton(page), 'the previous roster must stop being saveable at once').toBeDisabled();
  await expect(page.getByText('Pupil One', { exact: true })).toHaveCount(0);
  expect(backend.writes).toEqual([]);

  backend.release(key(2));
  await expect(page.getByText('Pupil Two', { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
});

test('B03 a failed roster load reports the error and blocks saving', async ({ page, backend }) => {
  backend.fail(key(2));
  await openAttendance(page);
  await expect(page.getByText('Pupil One', { exact: true })).toBeVisible();

  const failed = page.waitForResponse((r) => r.url().includes(key(2)) && r.status() === 503);
  await classSelect(page).selectOption('2');
  await failed;

  await expect(page.getByText('Cannot load roster', { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  expect(backend.writes).toEqual([]);
});
