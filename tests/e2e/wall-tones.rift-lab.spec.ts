import { expect, test } from '@playwright/test';

/**
 * Rift Sealing Lab (backlog item 75). Flat-mode e2e: the Lab menu's Rift row
 * opens the rift lab, and the debug surface drives a full charge-seal loop:
 * notes charge energy, a rift opens (modifier gate on), a real click at its
 * rendered camera-projected position seals it (modifier gate off).
 * Off-target, panel, and undercharged clicks must leave it untouched.
 */
const mode = (page: import('@playwright/test').Page) =>
  page.evaluate(() => sessionStorage.getItem('iwsdk-experience-mode'));

const snapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__riftLabDebug!.snapshot());

test('Rift Sealing Lab opens from the Lab menu and runs the charge-seal loop', async ({ page }) => {
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  // Open the Lab menu from the floating Lab entry.
  await page.mouse.click(1100, 320);
  await expect.poll(() => mode(page)).toBe('lab');
  await page.waitForFunction(() => window.__riftLabDebug != null);

  // Click the Rift Sealing Lab row (second row on the Lab menu).
  await page.waitForTimeout(2000);
  await page.mouse.move(640, 457);
  await page.mouse.click(640, 457);
  await expect.poll(() => mode(page)).toBe('riftlab');
  expect(await page.title()).toBe('Wall Tones 2: Rift Sealing Lab');

  await page.evaluate(() => window.__riftLabDebug!.start());
  let snap = await snapshot(page);
  expect(snap.running).toBe(true);
  expect(snap.openRifts).toBe(1);
  expect(snap.modifierActive).toBe(true); // his until-cleared gate

  const [ux, uy] = snap.targets[0].ndc;
  await page.mouse.click(((ux + 1) / 2) * 1280, ((1 - uy) / 2) * 800);
  expect((await snapshot(page)).energy).toBe(0);
  expect((await snapshot(page)).openRifts).toBe(1);

  // Successful notes charge the hands (lab stand-in for main-game notes).
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.__riftLabDebug!.playNote('green', 'right');
  });
  snap = await snapshot(page);
  expect(snap.status).toMatch(/^Ready\./);
  expect(snap.status).not.toContain('Not enough');
  expect(snap.energy).toBe(120); // settled 14:46: 12 notes = one closure
  expect(snap.noteCount).toBe(72); // 6 cloud notes per success

  // Desktop note anchor follows the cursor in the rendered camera, not
  // either fixed flat-hand fallback. The source remains XR/touch-specific.
  await page.mouse.move(1050, 130);
  await page.waitForTimeout(100);
  const origin = (await snapshot(page)).noteOriginNdc;
  expect(origin[0]).toBeCloseTo((1050 / 1280) * 2 - 1, 3);
  expect(origin[1]).toBeCloseTo(1 - (130 / 800) * 2, 3);

  // Panel click must not close any rift.
  await page.mouse.click(640, 300);
  expect((await snapshot(page)).energy).toBe(120);
  // Empty background also must not spend energy.
  await page.mouse.click(1210, 730);
  expect((await snapshot(page)).energy).toBe(120);

  // Click the ACTUAL visible target, using its camera projection rather
  // than the old linear pixel-to-world approximation.
  const beforeClick = await snapshot(page);
  const [nx, ny] = beforeClick.targets[0].ndc;
  const canvas = await page.locator('canvas').first().boundingBox();
  expect(canvas).not.toBeNull();
  const x = canvas!.x + ((nx + 1) / 2) * canvas!.width;
  const y = canvas!.y + ((1 - ny) / 2) * canvas!.height;
  await page.mouse.click(x, y);
  const targetId = beforeClick.targets[0].id;
  await expect.poll(async () =>
    (await snapshot(page)).targets.some((target) => target.id === targetId),
  ).toBe(false);
  snap = await snapshot(page);
  expect(snap.energy).toBe(0);
  // A slow renderer can cross the six-second automatic spawn boundary.
  // New targets are independent of the clicked target's verified removal.
  expect(snap.modifierActive).toBe(snap.openRifts > 0);
});

// Isolated diagnostic branch only: keep successful and failed interaction traces.
test.use({ trace: 'on' });

test('Rift Lab Back returns to the Lab menu', async ({ page }, testInfo) => {
  const evidence: unknown[] = [];
  page.on('console', message => {
    if (message.text().startsWith('[back-diag]')) {
      evidence.push({ kind: 'browser', receivedAt: Date.now(), text: message.text() });
    }
  });
  page.on('pageerror', error => evidence.push({ kind: 'pageerror', text: error.stack }));
  await page.addInitScript(() => {
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      window.addEventListener(type, event => {
        const pointer = event as MouseEvent;
        const target = event.target instanceof Element ? event.target : null;
        console.info('[back-diag]', JSON.stringify({
          stage: 'pointer-capture', type, time: performance.now(),
          x: pointer.clientX, y: pointer.clientY,
          targetTag: target?.tagName, targetId: target?.id,
          storedMode: sessionStorage.getItem('iwsdk-experience-mode'),
        }));
      }, true);
    }
  });
  try {
    await page.goto('/?diagBack=1');
    await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
    await page.mouse.click(1100, 320);
    await expect.poll(() => mode(page)).toBe('lab');
    await page.waitForTimeout(2000);
    await page.mouse.move(640, 457);
    await page.mouse.click(640, 457);
    await expect.poll(() => mode(page)).toBe('riftlab');
    await page.waitForTimeout(1000);
    // Back is the last button on the Rift Lab panel.
    await page.mouse.click(640, 357);
    await expect.poll(() => mode(page)).toBe('lab');
  } finally {
    // Capture only after the original assertion completes or fails. No extra
    // screenshot wait is inserted before the original Back click.
    await testInfo.attach('back-hit-handler-timing', {
      body: JSON.stringify(evidence, null, 2), contentType: 'application/json',
    });
    if (!page.isClosed()) {
      await testInfo.attach('back-final-pixels', {
        body: await page.screenshot(), contentType: 'image/png',
      });
    }
  }
});
