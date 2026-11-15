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

  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.__riftLabDebug!.playNote('green', 'right');
  });
  const snap = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(snap.energy).toBe(120);
  const [nx, ny] = snap.targets[0].ndc;
  const tx = ((nx + 1) / 2) * 390;
  const ty = ((1 - ny) / 2) * 664;

  const cdp = await page.context().newCDPSession(page);
  const at = (x: number, y: number) => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(30, 600) });
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(30 + ((tx - 30) * i) / 12, 600 + ((ty - 600) * i) / 12),
    });
  }
  await expect
    .poll(() => page.evaluate(() => window.__riftLabDebug!.snapshot().status), { timeout: 15000 })
    .toBe('Rift sealed.');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await page.evaluate(() => window.__riftLabDebug!.snapshot())).energy).toBe(0);
});
