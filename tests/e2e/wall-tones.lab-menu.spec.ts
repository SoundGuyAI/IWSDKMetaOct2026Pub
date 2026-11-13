import { expect, test } from '@playwright/test';

/**
 * Shared Lab menu foundation. Flat-mode e2e with real canvas clicks: the Lab
 * entry floats right of the main menu (1280x800 viewport), the Lab menu lists
 * the capability demos, and Back returns to the main menu.
 */
const mode = (page: import('@playwright/test').Page) =>
  page.evaluate(() => sessionStorage.getItem('iwsdk-experience-mode'));

test('Lab entry opens the Lab menu and Back returns to the main menu', async ({ page }) => {
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.mouse.click(1100, 320);
  await expect.poll(() => mode(page)).toBe('lab');
  expect(await page.title()).toBe('Wall Tones 2: Lab');
  // Let the Lab menu take the flat layout and render before clicking Back
  // (bottom row; sits under the connected Rift Sealing Lab row).
  await page.waitForTimeout(2000);
  await page.mouse.move(640, 532);
  await page.mouse.click(640, 532);
  await expect.poll(() => mode(page)).toBe('menu');
});
