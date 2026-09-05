import { test, expect } from '@playwright/test';
async function setup(page) {
  const context = page.context();
  const writes = [], requests = [], errors = [], gates = new Map(), failures = new Set();
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const r = route.request(), u = new URL(r.url()), key = u.pathname + u.search;
    requests.push(key);
    if (gates.has(key)) await gates.get(key).promise;
    if (failures.has(key)) return route.fulfill({ status: 503, json: { error: 'Simulated service failure' } });
    if (r.method() === 'POST') {
      writes.push({ path: u.pathname, body: r.postDataJSON() });
      return route.fulfill({ json: { ok: true, student: { roll: '91000', name: 'Pupil One' } } });
    }
    let data;
    if (u.pathname === '/api/auth/me') data = { id: 1, name: 'Audit Teacher', subject: 'Math' };
    else if (u.pathname === '/api/classes') data = [1, 2].map(id => ({ id, name: `Class ${id}`, subject: 'Math' }));
    else if (u.pathname === '/api/dashboard') data = [1, 2].map(id => ({ id, name: `Class ${id}`, subject: 'Math', studentCount: 1, attendanceRate: 100, pendingGradingCount: 0 }));
    else if (u.pathname === '/api/term-scores') {
      const other = u.searchParams.get('classId') === '2';
      data = [{ studentId: other ? 22 : 11, roll: other ? '91001' : '91000', name: other ? 'Pupil Two' : 'Pupil One', pre_midterm: { score: other ? 90 : 10, maxScore: 100 }, midterm: null, final: null }];
    } else if (u.pathname === '/api/attendance') {
      const other = u.searchParams.get('classId') === '2';
      data = [{ id: other ? 22 : 11, roll: other ? '91001' : '91000', name: other ? 'Pupil Two' : 'Pupil One', status: other ? 'absent' : 'present' }];
    } else if (u.pathname === '/api/assignments') data = (u.searchParams.get('classId') === '2' ? [201] : [101, 102]).map(id => ({ id, title: `Assignment ${id}`, maxScore: 100, submittedCount: 1, totalStudents: 1, dueDate: null }));
    else if (u.pathname.match(/\/assignments\/\d+\/submissions/)) data = { roster: [{ studentId: 11, name: 'Pupil One', roll: '91000', submitted: true, score: 10 }] };
    else if (u.pathname === '/api/schedule') data = [1, 2].map(id => ({ id, classRoomId: id, className: `Class ${id}`, subject: 'Math', dayOfWeek: 1, startTime: '08:30', endTime: '09:20' }));
    else if (u.pathname === '/api/missing-work') data = [];
    else if (u.pathname.startsWith('/api/reports/')) return route.fulfill({ body: 'local-download-fixture', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    else throw new Error(`Unhandled ${key}`);
    return route.fulfill({ json: data });
  });
  const hold = key => { let release; const promise = new Promise(r => { release = r; }); gates.set(key, { promise, release }); };
  const release = key => { gates.get(key)?.release(); gates.delete(key); };
  await page.goto('/');
  await page.locator('.nav-links').waitFor();
  return { context, page, writes, requests, errors, hold, release, failures,
    async close() { for (const g of gates.values()) g.release(); await context.close(); },
  };
}
const nav = (page, text) => page.locator('.nav-links').getByText(text, { exact: true }).click();
test('B06 clearing an exam cell sends an explicit deletion', async ({ page }) => {
  const f = await setup(page);
  await nav(page, 'ตรวจงานและประเมินผล');
  await page.getByRole('button', { name: /คะแนนสอบ \(/ }).click();
  await expect(page.getByRole('spinbutton').first()).toHaveValue('10');
  await page.getByRole('spinbutton').first().fill('');
  await page.getByRole('button', { name: 'บันทึกคะแนนสอบ', exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.records).toEqual([{ studentId: 11, term: 'pre_midterm', score: '', maxScore: 100 }]);
});

test('B15 dashboard and schedule preserve the classroom selected', async ({ page }) => {
  await setup(page);
  await page.locator('.class-dashboard-card').filter({ hasText: 'Class 2' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('2');
  await expect(page.getByText('Pupil Two', { exact: true })).toBeVisible();
  await nav(page, 'ตารางสอนและชั้นเรียน');
  await page.locator('.glass-panel').filter({ has: page.getByRole('heading', { name: 'Class 2', exact: true }) }).getByRole('button', { name: 'ตรวจงาน', exact: true }).click();
  await expect(page.getByRole('combobox').first()).toHaveValue('2');
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('201');
});

for (const [path, label] of [['/api/missing-work','งานที่ค้างส่ง'], ['/api/schedule','ตารางสอนและชั้นเรียน'], ['/api/dashboard','หน้าหลัก']]) {
  test(`B18 ${path} failure shows an error and retry recovers`, async ({ page }) => {
    const f = await setup(page);
    await nav(page, 'รายงาน');
    f.failures.add(path); await nav(page, label);
    await expect(page.getByRole('alert')).toContainText('Simulated service failure');
    await expect(page.getByText('กำลังโหลด...', { exact: true })).toHaveCount(0);
    expect(f.errors).toEqual([]);
    f.failures.delete(path);
    await page.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('B18 assignment creation and report download show failed requests', async ({ page }) => {
  const f = await setup(page);
  await nav(page, 'ตรวจงานและประเมินผล');
  await page.getByRole('button', { name: 'สร้างงานใหม่', exact: true }).click();
  await page.locator('form input').first().fill('Synthetic new work');
  f.failures.add('/api/assignments');
  await page.getByRole('button', { name: 'สร้างงาน', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Simulated service failure');
  await nav(page, 'รายงาน');
  f.failures.add('/api/reports/missing-work.xlsx');
  await page.getByRole('button', { name: 'ดาวน์โหลด', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Simulated service failure');
  expect(f.errors).toEqual([]);
});

test('B19 Excel download has exactly one extension', async ({ page }) => {
  await setup(page); await nav(page, 'รายงาน');
  await expect(page.getByRole('combobox').nth(1).locator('option[value="1"]')).toHaveCount(1);
  await page.getByRole('combobox').nth(1).selectOption('1');
  await page.getByLabel('เลขประจำตัวนักเรียน', { exact: true }).check();
  await page.getByRole('textbox').last().fill('scores.xlsx');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'สร้างและดาวน์โหลด', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('scores.xlsx');
});

test('B09 B21 sidebar and submission status work from the keyboard', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.nav-item').first()).toBeFocused();
  const grades = page.locator('.nav-links').getByRole('button', { name: 'ตรวจงานและประเมินผล', exact: true });
  await grades.focus(); await page.keyboard.press('Enter');
  const submitted = page.getByRole('button', { name: 'ส่งแล้ว', exact: true });
  await expect(page.getByRole('spinbutton')).toHaveValue('10');
  await submitted.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'ยังไม่ส่ง', exact: true })).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('spinbutton')).toHaveValue('');
});

test('B22 B23 attendance save is reachable on a phone and page language is Thai', async ({ page }) => {
  const f = await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await nav(page, 'เช็คชื่อเข้าเรียน');
  await expect(page.getByText('Pupil One', { exact: true })).toBeVisible();
  const save = page.getByRole('button', { name: 'บันทึก', exact: true });
  const box = await save.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await save.click(); await expect.poll(() => f.writes.length).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('lang','th');
});

test('B10 attendance posts Bangkok date when UTC is still yesterday', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-05T18:30:00Z') });
  const f = await setup(page); await nav(page, 'เช็คชื่อเข้าเรียน');
  await expect(page.getByText('Pupil One', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0].body.date).toBe('2026-09-06');
});
