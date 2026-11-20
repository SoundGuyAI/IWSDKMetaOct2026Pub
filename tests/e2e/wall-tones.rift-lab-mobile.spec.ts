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
  await page.addInitScript(() => sessionStorage.setItem('iwsdk-rift-lab-test-controls', '1'));
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(195, 51); // floating Lab entry
  await page.waitForTimeout(2500);
  await page.touchscreen.tap(195, 370); // Rift Sealing Lab row (Voice row added 2026-11-18: menu shifted up, recalibrated 394 -> 370, screenshot-verified)
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.__riftLabDebug != null);
  await page.touchscreen.tap(195, 264); // Start
  await expect
    .poll(() => page.evaluate(() => window.__riftLabDebug!.snapshot().openRifts), { timeout: 15000 })
    .toBeGreaterThan(0);

  // Isolated full-charge contract: pause the 6 s auto-spawn for THIS test only
  // (Start resets it). The cross-rift behavior with normal spawning is covered
  // by wall-tones.rift-lab-cross.spec.ts, so it stays tested elsewhere.
  await page.evaluate(() => window.__riftLabDebug!.setAutoSpawn!(false));
  // Lab Start grants one seal of energy, so no playNote charge loop is needed
  // before the corner drag can seal.
  const snap = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(snap.energy).toBe(120);
  expect(snap.targets.length).toBe(1);
  const intendedId = snap.targets[0].id;
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
  // Hold on the live rift NDC (reflow can shift the spawn) past SEAL_HOLD_MS.
  await expect
    .poll(
      async () => {
        const live = await page.evaluate(() => {
          const s = window.__riftLabDebug!.snapshot();
          const t = s.targets[0];
          return {
            n: s.targets.length,
            status: s.status,
            energy: s.energy,
            tx: t == null ? null : ((t.ndc[0] + 1) / 2) * window.innerWidth,
            ty: t == null ? null : ((1 - t.ndc[1]) / 2) * window.innerHeight,
          };
        });
        if (live.tx != null && live.ty != null) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: at(live.tx, live.ty),
          });
        }
        expect(live.n, 'exactly the intended rift is open during the drag').toBeLessThanOrEqual(1);
        return live.status;
      },
      { timeout: 15000, intervals: [50, 50, 100] },
    )
    .toBe('Rift sealed.');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const done = await page.evaluate(() => window.__riftLabDebug!.snapshot());
  expect(done.energy).toBe(0);
  // The intended rift is the one that sealed: sealed rifts leave the list after the
  // flight, so it must be gone (or sealed) and no other rift may have been sealed.
  const intended = done.rifts.find((r) => r.id === intendedId);
  expect(intended === undefined || intended.state === 'sealed').toBe(true);
  expect(done.rifts.filter((r) => r.id !== intendedId && r.state === 'sealed')).toEqual([]);
});
