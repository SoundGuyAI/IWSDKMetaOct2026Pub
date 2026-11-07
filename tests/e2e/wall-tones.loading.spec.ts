import { expect, test } from '@playwright/test';

/**
 * Loading splash (user ask, Nov 7): a static overlay in index.html covers the
 * cold-load window - before it, taps on the app menu land on an uninitialised
 * panel and the screen is black; it lifts only when the app signals the menu
 * is interactive (buttons wired AND menu text able to render - the Inter MSDF
 * font chunk can land seconds after init). A failed script fetch is distinct
 * from a 45s inactivity warning, which can still recover when loading resumes.
 */

test('the splash lifts once the menu is usable, and Start Wall Tones enters the game', async ({
  page,
}) => {
  await page.route('**/audio/speech/**', (route) => route.abort());
  await page.goto('/');
  // The splash is part of the static HTML, present from first paint.
  await expect(page.locator('#wt-loading')).toBeAttached();
  // It lifts only when the app menu is interactive (not merely parsed).
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await expect(page.locator('#wt-loading-error')).toBeHidden();
  // The menu really works afterwards: a real click on Start Wall Tones enters
  // the game (viewport fixed at 1280x800 by playwright.config; the button is
  // the top of the three on the centred menu panel).
  await page.mouse.click(640, 285);
  await page.waitForFunction(
    () =>
      (window as unknown as { __wallTonesDebug?: { flatAwaitingStart: boolean } })
        .__wallTonesDebug?.flatAwaitingStart === true,
    null,
    { timeout: 60000 },
  );
});

test('a failed app script fetch swaps the splash to a retryable error state', async ({
  page,
}) => {
  await page.route('**/assets/index-*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#wt-loading-error')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#wt-loading-spin')).toBeHidden();
  await expect(page.locator('#wt-retry')).toBeVisible();
  // The app never got a chance to run, so the ready signal must not exist.
  const readyCalled = await page.evaluate(
    () =>
      (window as unknown as { __wtAppReady?: () => void }).__wtAppReady !=
        null &&
      document.getElementById('wt-loading') == null,
  );
  expect(readyCalled).toBe(false);
});

test('the splash waits for menu text when the font chunk is slow', async ({
  page,
}) => {
  await page.route('**/audio/speech/**', (route) => route.abort());
  // Hold the MSDF font chunk back: menu wiring finishes long before any text
  // can render, so an ungated ready signal would lift the splash onto an
  // icon-only menu.
  await page.route('**/assets/inter-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await route.continue();
  });
  await page.goto('/');
  // Five seconds in, wiring is done but the font is still pending: the splash
  // must still be covering the menu.
  await page.waitForTimeout(5000);
  await expect(page.locator('#wt-loading')).toBeAttached();
  await expect(page.locator('#wt-loading-error')).toBeHidden();
  // Once the font lands, the splash lifts.
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 30000 });
  await expect(page.locator('#wt-loading-error')).toBeHidden();
});

test('mobile sound-start gate is reachable above the splash and does not time out waiting for a tap', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.route('**/audio/speech/**', route => route.abort());
  await page.goto('https://localhost:4173/');
  const start = page.locator('#audio-start-button');
  await expect(start).toBeVisible();
  await expect(page.locator('#wt-loading-detail')).toContainText('Tap Start');
  const reachable = await start.evaluate(el => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el;
  });
  expect(reachable).toBe(true);
  await page.clock.install();
  await page.clock.fastForward(60000);
  await expect(page.locator('#wt-loading-error')).toBeHidden();
  await page.clock.resume();
  await start.tap();
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await expect(page.locator('#audio-start-gate')).not.toBeAttached();
  await context.close();
});

test('a stalled font reports the real waiting checkpoint and can recover after the warning', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/inter-*.js', async route => { await gate; await route.continue(); });
  await page.goto('/');
  await expect(page.locator('#wt-loading-detail')).toContainText('Menu text fonts ready:');
  await page.clock.install();
  // Reset this checkpoint's stall timer under the test clock.
  await page.evaluate(() => (window as any).__wtLoading.stage('fonts', 'Menu text fonts ready: still waiting for the font response.'));
  await page.clock.fastForward(45001);
  await expect(page.locator('#wt-loading-reason')).toContainText('Still waiting for Menu fonts');
  await expect(page.locator('[data-step="code"]')).toContainText('Loaded: Game code');
  await expect(page.locator('[data-step="fonts"]')).toContainText('Loading: Menu fonts');
  await page.clock.resume();
  release();
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 30000 });
});
