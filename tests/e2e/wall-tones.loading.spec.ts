import { expect, test } from '@playwright/test';

/**
 * Loading splash (user ask, Nov 7): a static overlay in index.html covers the
 * cold-load window - before it, taps on the app menu land on an uninitialised
 * panel and the screen is black; it lifts only when the app signals the menu
 * is interactive (buttons wired AND menu text able to render - the Inter MSDF
 * font chunk can land seconds after init), and a failed script fetch or a 30s
 * stall swaps in a retryable error state instead of spinning forever.
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
