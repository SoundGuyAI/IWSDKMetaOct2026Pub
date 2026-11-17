import { expect, test } from '@playwright/test';

/**
 * Rift Sealing Lab on a narrow portrait touch screen (iPhone-like). Guards two
 * reported failures: Start opened no rift on portrait, and the touch drag from
 * the bottom-left orb never reached or sealed a rift. Real taps and a real
 * touch drag through CDP, not the debug shortcuts.
 */
test.use({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});

test('portrait touch: Start opens a rift and a corner drag seals it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(195, 51); // floating Lab entry
  await page.waitForTimeout(2500);
  await page.touchscreen.tap(195, 394); // Rift Sealing Lab row
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.__riftLabDebug != null);
  await page.touchscreen.tap(195, 264); // Start
  await expect
    .poll(() => page.evaluate(() => window.__riftLabDebug!.snapshot().openRifts), { timeout: 15000 })
    .toBeGreaterThan(0);

  // Lab Start grants one seal of energy (owner ask 2026-11-17) — no playNote
  // charge loop needed before the corner drag can seal.
  const snap = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(snap.energy).toBe(120);
  // The resting orb must render inside the bottom-left touch zone it is
  // dragged from (regression: it used to float mid-screen, so pressing the
  // visible dots never started the drag).
  const [onx, ony] = snap.noteOriginNdc;
  expect((onx + 1) / 2).toBeLessThanOrEqual(0.4);
  expect((1 - ony) / 2).toBeGreaterThanOrEqual(0.72);
  const orbX = ((onx + 1) / 2) * 390;
  const orbY = ((1 - ony) / 2) * 664;
  const [nx, ny] = snap.targets[0].ndc;
  const tx = ((nx + 1) / 2) * 390;
  const ty = ((1 - ny) / 2) * 664;

  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y }];

  // A press that is not on the orb must not move the orb or start a drag
  // (his 22:59 note: it jumped to wherever the finger landed).
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(300, 120) });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(310, 140) });
  await page.waitForTimeout(120);
  const away = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(away.beamActive).toBe(false);
  expect(away.noteOriginNdc[0]).toBeCloseTo(onx, 3);
  expect(away.noteOriginNdc[1]).toBeCloseTo(ony, 3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(orbX, orbY) });
  // Finger on the orb: the cloud grows to fingertip + 50% (>= 16 mm * 1.5
  // at ~6 px/mm, so >= 70 px radius) so the finger no longer hides it.
  await page.waitForTimeout(150);
  const held = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(held.beamActive).toBe(true);
  expect(held.noteCloudRadiusPx).toBeGreaterThanOrEqual(70);
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(orbX + ((tx - orbX) * i) / 12, orbY + ((ty - orbY) * i) / 12),
    });
  }
  await expect
    .poll(() => page.evaluate(() => window.__riftLabDebug!.snapshot().status), { timeout: 15000 })
    .toBe('Rift sealed.');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await page.evaluate(() => window.__riftLabDebug!.snapshot())).energy).toBe(0);
});
