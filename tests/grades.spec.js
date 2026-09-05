import { test as base, expect } from '@playwright/test';

const classes = [
  { id: 1, name: 'Class One', subject: 'Mathematics' },
  { id: 2, name: 'Class Two', subject: 'Mathematics' },
];

const assignment = (id, title) => ({
  id, title, maxScore: 100, dueDate: null, submittedCount: 1, totalStudents: 1,
});

// The mock server owns persistence independently of the UI. A and B deliberately
// share the same pupil, so classroom membership checks cannot mask the race.
const test = base.extend({
  backend: async ({ page }, provide) => {
    const scores = new Map([[101, 10], [102, 90], [201, 70]]);
    const writes = [];
    const gates = new Map();
    const failures = new Set();
    const requests = [];
    const lists = new Map([
      [1, [assignment(101, 'Assignment A'), assignment(102, 'Assignment B')]],
      [2, [assignment(201, 'Assignment C')]],
    ]);

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${url.pathname}${url.search}`;
      requests.push({ key, method: request.method() });
      let response;

      if (url.pathname === '/api/auth/me') {
        response = { id: 1, name: 'Test Teacher', subject: 'Mathematics' };
      } else if (url.pathname === '/api/dashboard') {
        response = [];
      } else if (url.pathname === '/api/classes') {
        response = classes;
      } else if (url.pathname === '/api/assignments') {
        response = lists.get(Number(url.searchParams.get('classId'))) ?? [];
      } else {
        const match = url.pathname.match(/^\/api\/assignments\/(\d+)\/submissions$/);
        if (!match) throw new Error(`Unexpected API request: ${request.method()} ${key}`);
        const id = Number(match[1]);
        const studentId = id === 201 ? 22 : 11;
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          writes.push({ assignmentId: id, ...body });
          for (const record of body.records) {
            if (record.studentId === studentId) scores.set(id, record.score);
          }
          await route.fulfill({ json: { ok: true } });
          return;
        }
        // Capture data when the request starts; releasing a gate reproduces a
        // delayed response without letting later writes alter its contents.
        response = {
          assignment: lists.get(id === 201 ? 2 : 1).find((item) => item.id === id),
          roster: [{
            studentId, name: id === 201 ? 'Pupil Two' : 'Pupil One',
            roll: '1', submitted: true, score: scores.get(id),
          }],
        };
      }

      if (gates.has(key)) await gates.get(key).promise;
      if (failures.has(key)) {
        await route.fulfill({ status: 503, json: { error: 'Cannot load selected assignment' } });
      } else {
        await route.fulfill({ json: response });
      }
    });

    const backend = {
      scores, writes, requests,
      hold(key) {
        let release;
        const promise = new Promise((resolve) => { release = resolve; });
        gates.set(key, { promise, release });
      },
      release(key) {
        gates.get(key)?.release();
        gates.delete(key);
      },
      fail(key) { failures.add(key); },
    };
    try {
      await provide(backend);
    } finally {
      for (const gate of gates.values()) gate.release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  },
});

async function openGrades(page) {
  await page.goto('/');
  await page.locator('.nav-links').getByText('ตรวจงานและประเมินผล', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ตรวจงานและประเมินผล' })).toBeVisible();
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('101');
}

const saveButton = (page) => page.getByRole('button', { name: 'บันทึกคะแนน', exact: true });
const scoreInput = (page) => page.getByRole('spinbutton');
const selectAssignment = (page, id) => page.getByRole('combobox').nth(1).selectOption(String(id));

async function clickSaveIfEnabled(page) {
  const save = saveButton(page);
  const disabled = await save.isDisabled();
  expect.soft(disabled, 'Saving must be disabled until the selected roster loads').toBe(true);
  if (!disabled) {
    const saved = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith('/submissions'));
    await save.click();
    await saved;
  }
}

test('switching assignments cannot save the previous assignment grades while loading', async ({ page, backend }) => {
  const target = '/api/assignments/102/submissions';
  backend.hold(target);
  await openGrades(page);
  await expect(scoreInput(page)).toHaveValue('10');

  await selectAssignment(page, 102);
  await expect.poll(() => backend.requests.some((request) => request.key === target)).toBe(true);
  await clickSaveIfEnabled(page);
  expect.soft(backend.writes, 'No grade write is allowed before B loads').toEqual([]);
  expect(backend.scores.get(102), 'B must retain its independently stored grade').toBe(90);

  backend.release(target);
  await expect(scoreInput(page)).toHaveValue('90');
  await expect(saveButton(page)).toBeEnabled();
  await scoreInput(page).fill('91');
  await saveButton(page).click();
  await expect.poll(() => backend.scores.get(102)).toBe(91);
  expect(backend.scores.get(101), 'Editing B must leave A unchanged').toBe(10);
  expect(backend.writes).toEqual([{
    assignmentId: 102, records: [{ studentId: 11, submitted: true, score: 91 }],
  }]);
});

test('an old assignment response cannot replace the newly selected roster', async ({ page, backend }) => {
  const previous = '/api/assignments/101/submissions';
  backend.hold(previous);
  await openGrades(page);
  await expect.poll(() => backend.requests.some((request) => request.key === previous)).toBe(true);
  await selectAssignment(page, 102);
  await expect(scoreInput(page)).toHaveValue('90');

  const previousResponse = page.waitForResponse((response) => response.url().endsWith(previous));
  backend.release(previous);
  await previousResponse;
  // Wait for the response body to be consumed and React to render its update,
  // then read the screen. The application and server have no artificial timers.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(scoreInput(page)).toHaveValue('90');
  await saveButton(page).click();
  await expect.poll(() => backend.writes.length).toBe(1);
  expect(backend.scores.get(102)).toBe(90);
  expect(backend.writes[0].assignmentId).toBe(102);
});

test('switching classrooms cannot keep the previous classroom assignment writable', async ({ page, backend }) => {
  const target = '/api/assignments?classId=2';
  backend.hold(target);
  await openGrades(page);
  await expect(scoreInput(page)).toHaveValue('10');
  await page.getByRole('combobox').first().selectOption('2');
  await expect.poll(() => backend.requests.some((request) => request.key === target)).toBe(true);

  await clickSaveIfEnabled(page);
  expect(backend.writes, 'The previous classroom assignment must become unsaveable immediately').toEqual([]);
  await expect(page.getByRole('combobox').nth(1).locator('option[value="101"]')).toHaveCount(0);

  backend.release(target);
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('201');
  await expect(scoreInput(page)).toHaveValue('70');
  await expect(page.getByText('Pupil Two', { exact: true })).toBeVisible();
  await expect(page.getByText('Pupil One', { exact: true })).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
});

test('a failed new roster load cannot leave the previous grades saveable', async ({ page, backend }) => {
  const target = '/api/assignments/102/submissions';
  backend.fail(target);
  await openGrades(page);
  await expect(scoreInput(page)).toHaveValue('10');
  const failedResponse = page.waitForResponse((response) => response.url().endsWith(target) && response.status() === 503);
  await selectAssignment(page, 102);
  await failedResponse;
  await clickSaveIfEnabled(page);
  expect.soft(backend.writes).toEqual([]);
  expect(backend.scores.get(102)).toBe(90);
  await expect(page.getByText('Cannot load selected assignment', { exact: true })).toBeVisible();
});
