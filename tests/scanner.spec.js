import { test as base, expect } from '@playwright/test';

const classes = [
  { id: 1, name: 'Class One', subject: 'Mathematics' },
  { id: 2, name: 'Class Two', subject: 'Mathematics' },
];

const assignmentLists = {
  1: [
    { id: 101, title: 'Assignment A', type: 'homework', dueDate: null, maxScore: 100, submittedCount: 0, totalStudents: 1 },
    { id: 102, title: 'Assignment B', type: 'homework', dueDate: null, maxScore: 100, submittedCount: 0, totalStudents: 1 },
  ],
  2: [
    { id: 201, title: 'Assignment C', type: 'homework', dueDate: null, maxScore: 100, submittedCount: 0, totalStudents: 1 },
  ],
};

// Replaces only the camera decoder boundary: the real component, its real state and the
// real request code still run. `window.__decodeFrame` delivers a decoded frame to
// whatever callback the component registered when the camera started - which is exactly
// the callback that used to hold a stale classroom/assignment/mode.
const CAMERA_STUB = `
export class Html5Qrcode {
  constructor(elementId) { this.elementId = elementId; }
  async start(_camera, _config, onDecode) {
    window.__decodeFrame = (text) => onDecode(text);
    window.__cameraRunning = true;
  }
  async stop() { window.__cameraRunning = false; }
  async clear() {}
}
export class Html5QrcodeScanner {}
export default { Html5Qrcode };
`;

const test = base.extend({
  backend: async ({ page }, provide) => {
    const scans = [];
    const gates = new Map();

    await page.route('**/html5-qrcode**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: CAMERA_STUB })
    );

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${url.pathname}${url.search}`;

      if (url.pathname.startsWith('/api/scan/')) {
        scans.push({ endpoint: url.pathname, body: request.postDataJSON() });
        await route.fulfill({ json: { ok: true, student: { roll: '1', name: 'Pupil One' } } });
        return;
      }

      let response;
      if (url.pathname === '/api/auth/me') response = { id: 1, name: 'Test Teacher', subject: 'Mathematics' };
      else if (url.pathname === '/api/dashboard') response = [];
      else if (url.pathname === '/api/classes') response = classes;
      else if (url.pathname === '/api/assignments') response = assignmentLists[Number(url.searchParams.get('classId'))] ?? [];
      else if (url.pathname.match(/^\/api\/classes\/\d+\/students$/)) response = [];
      else throw new Error(`Unexpected API request: ${request.method()} ${key}`);

      if (gates.has(key)) await gates.get(key).promise;
      await route.fulfill({ json: response });
    });

    const backend = {
      scans,
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

async function openScanner(page) {
  await page.goto('/');
  await page.locator('.nav-links').getByText('QR & สแกน', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'QR & สแกน' })).toBeVisible();
}

const startCamera = async (page) => {
  await page.getByRole('button', { name: 'เปิดกล้อง' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__cameraRunning))).toBe(true);
};

const decode = (page, code) => page.evaluate((text) => window.__decodeFrame(text), code);

test('B04 a running camera follows the currently selected assignment', async ({ page, backend }) => {
  await openScanner(page);
  await page.getByRole('button', { name: 'ตรวจงานส่ง' }).click();
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('101');

  await startCamera(page);
  await page.getByRole('combobox').nth(1).selectOption('102');

  await decode(page, '91001');
  await expect.poll(() => backend.scans.length).toBe(1);
  expect(backend.scans[0].endpoint).toBe('/api/scan/submission');
  expect(backend.scans[0].body.assignmentId, 'the scan must target the visible assignment').toBe(102);
});

test('B04 a running camera follows the currently selected scan mode', async ({ page, backend }) => {
  await openScanner(page);
  await startCamera(page);
  await decode(page, '91001');
  await expect.poll(() => backend.scans.length).toBe(1);
  expect(backend.scans[0].endpoint).toBe('/api/scan/attendance');

  await page.getByRole('button', { name: 'ตรวจอุปกรณ์การเรียน' }).click();
  await decode(page, '91001');
  await expect.poll(() => backend.scans.length).toBe(2);
  expect(backend.scans[1].endpoint, 'a mode change must redirect the running camera').toBe('/api/scan/materials');
});

test('B04 a running camera follows the currently selected classroom', async ({ page, backend }) => {
  await openScanner(page);
  await startCamera(page);
  await page.getByRole('combobox').first().selectOption('2');

  await decode(page, '91001');
  await expect.poll(() => backend.scans.length).toBe(1);
  expect(backend.scans[0].body.classId, 'the scan must be recorded against the visible classroom').toBe(2);
});

test('B04 a scan is refused while the assignment list for the new classroom is loading', async ({ page, backend }) => {
  await openScanner(page);
  await page.getByRole('button', { name: 'ตรวจงานส่ง' }).click();
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('101');
  await startCamera(page);

  backend.hold('/api/assignments?classId=2');
  await page.getByRole('combobox').first().selectOption('2');

  await decode(page, '91001');
  await expect(page.getByText('91001: ยังไม่ได้เลือกงานที่จะเช็ค')).toBeVisible();
  expect(backend.scans, 'no submission may be recorded against the previous classroom').toEqual([]);

  backend.release('/api/assignments?classId=2');
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('201');
  await decode(page, '91001');
  await expect.poll(() => backend.scans.length).toBe(1);
  expect(backend.scans[0].body.assignmentId).toBe(201);
});
