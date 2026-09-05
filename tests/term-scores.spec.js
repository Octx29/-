import { test as base, expect } from '@playwright/test';

const classes = [
  { id: 1, name: 'Class One', subject: 'Mathematics' },
  { id: 2, name: 'Class Two', subject: 'Mathematics' },
];

// One pupil per classroom, with distinct database IDs, so an exam row written under
// the wrong classroom is visible in the POST body rather than merely plausible.
const termRows = {
  1: [{ studentId: 11, roll: '1', name: 'Pupil One', pre_midterm: null, midterm: { score: 10, maxScore: 100 }, final: null }],
  2: [{ studentId: 22, roll: '1', name: 'Pupil Two', pre_midterm: null, midterm: { score: 70, maxScore: 100 }, final: null }],
};

const test = base.extend({
  backend: async ({ page }, provide) => {
    const writes = [];
    const requests = [];
    const gates = new Map();

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${url.pathname}${url.search}`;
      requests.push({ key, method: request.method() });

      if (url.pathname === '/api/term-scores' && request.method() === 'POST') {
        writes.push(request.postDataJSON());
        await route.fulfill({ json: { ok: true } });
        return;
      }

      let response;
      if (url.pathname === '/api/auth/me') response = { id: 1, name: 'Test Teacher', subject: 'Mathematics' };
      else if (url.pathname === '/api/dashboard') response = [];
      else if (url.pathname === '/api/classes') response = classes;
      else if (url.pathname === '/api/term-scores') response = termRows[Number(url.searchParams.get('classId'))] ?? [];
      else if (url.pathname === '/api/assignments') response = [];
      else throw new Error(`Unexpected API request: ${request.method()} ${key}`);

      if (gates.has(key)) await gates.get(key).promise;
      await route.fulfill({ json: response });
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
    };
    try {
      await provide(backend);
    } finally {
      for (const gate of gates.values()) gate.release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  },
});

const key = (classId) => `/api/term-scores?classId=${classId}`;
const saveButton = (page) => page.getByRole('button', { name: 'บันทึกคะแนนสอบ', exact: true });
const midtermInput = (page) => page.getByRole('spinbutton').nth(1);

async function openTermScores(page) {
  await page.goto('/');
  await page.locator('.nav-links').getByText('ตรวจงานและประเมินผล', { exact: true }).click();
  await page.getByRole('button', { name: /คะแนนสอบ/ }).click();
}

test('B02 switching classrooms cannot save the previous classroom exam scores', async ({ page, backend }) => {
  backend.hold(key(2));
  await openTermScores(page);
  await expect(midtermInput(page)).toHaveValue('10');

  await page.getByRole('combobox').first().selectOption('2');
  await expect.poll(() => backend.requests.some((r) => r.key === key(2))).toBe(true);

  // Before the fix the classroom-1 rows stayed on screen and stayed editable while
  // classroom 2 loaded, so Save posted studentId 11 with classId 2.
  await expect(saveButton(page), 'saving must be blocked until the new classroom loads').toBeDisabled();
  expect(backend.writes).toEqual([]);

  backend.release(key(2));
  await expect(midtermInput(page)).toHaveValue('70');
  await expect(saveButton(page)).toBeEnabled();

  await midtermInput(page).fill('71');
  await saveButton(page).click();
  await expect.poll(() => backend.writes.length).toBeGreaterThan(0);
  expect(backend.writes[0].classId).toBe(2);
  expect(backend.writes[0].records.map((r) => r.studentId)).toEqual([22]);
});

test('B02 an obsolete exam-score response cannot replace the selected classroom rows', async ({ page, backend }) => {
  backend.hold(key(1));
  await openTermScores(page);
  await expect.poll(() => backend.requests.some((r) => r.key === key(1))).toBe(true);

  await page.getByRole('combobox').first().selectOption('2');
  await expect(midtermInput(page)).toHaveValue('70');

  const late = page.waitForResponse((response) => response.url().includes(key(1)));
  backend.release(key(1));
  await late;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await expect(midtermInput(page)).toHaveValue('70');
  await expect(page.getByText('Pupil One', { exact: true })).toHaveCount(0);

  await saveButton(page).click();
  await expect.poll(() => backend.writes.length).toBeGreaterThan(0);
  expect(backend.writes[0].classId).toBe(2);
  expect(backend.writes[0].records.map((r) => r.studentId)).toEqual([22]);
});
