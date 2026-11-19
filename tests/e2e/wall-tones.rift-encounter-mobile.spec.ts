import { expect, test } from '@playwright/test';

/**
 * Gameplay rift encounter on a narrow portrait touch screen (iPhone-like).
 * Regression guard for the Nov 20 report: on iPhone the streak-15 seam line
 * played but no portals appeared - the encounter's HUD keep-out rect covers
 * the whole portrait screen, so flat spot picking found no legal spawn spot
 * and the spawn retried forever. The HUD keep-out is desktop-only now; the
 * portrait right-half rule keeps phone rifts clear of the raised phone HUD.
 */
test.use({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});

test('portrait gameplay: the streak-15 encounter spawns a rift', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('iwsdk-experience-mode', 'walltones'));
  await page.goto('/');
  await page.waitForFunction(
    () => (window as any).__wallTonesDebug?.flatAwaitingStart === true,
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => (window as any).__wallTonesDebug.submitPad(0));
  await page.waitForFunction(() => (window as any).__wallTonesDebug.phase === 'input', undefined, {
    timeout: 75_000,
  });
  // Same entry point as the seam window firing at streak 15, minus the voice
  // line wait. First portal is due 12 s later; allow retries past that.
  await page.evaluate(() => (window as any).__wallTonesDebug.previewRiftEncounter());
  await expect
    .poll(() => page.evaluate(() => (window as any).__riftLabDebug?.snapshot().openRifts ?? 0), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
});
