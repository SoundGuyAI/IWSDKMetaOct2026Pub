import { expect, test } from '@playwright/test';

/**
 * Rift Sealing Lab (backlog item 75). Flat-mode e2e: the Lab menu's Rift row
 * opens the rift lab, and the debug surface drives a full charge-seal loop:
 * notes charge energy, a rift opens (modifier gate on), sealing clears it
 * (modifier gate off). PC click target and the modifier effect stay
 * UNRESOLVED and are not exercised as mechanics here.
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

  // Successful notes charge the hands (lab stand-in for main-game notes).
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__riftLabDebug!.playNote('green', 'right');
  });
  snap = await snapshot(page);
  expect(snap.energy).toBe(50);
  expect(snap.noteCount).toBe(5);

  // Seal the rift: modifier lifts, rift count drops.
  await page.evaluate(() => window.__riftLabDebug!.sealFirstRift());
  snap = await snapshot(page);
  expect(snap.openRifts).toBe(0);
  expect(snap.modifierActive).toBe(false);
});
