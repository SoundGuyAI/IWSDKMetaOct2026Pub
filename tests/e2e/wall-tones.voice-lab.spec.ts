import { expect, test } from '@playwright/test';

/**
 * Voice lab page: standalone microphone workbench at /voice-lab/.
 * These cover page structure, same-origin serving of the vendored
 * TensorFlow stack, and local-model preparation (backend + model load).
 * Actual word recognition with a live microphone is the on-device
 * (Quest/iPhone) test and is intentionally not simulated here.
 */
test.describe('voice lab page', () => {
  test('renders the workbench and loads the vendored libraries', async ({ page }) => {
    await page.goto('/voice-lab/');
    await expect(page.getByRole('heading', { name: 'Say it. See it.' })).toBeVisible();
    await expect(page.locator('#capability')).toContainText('Secure context: yes');
    await page.waitForFunction(() =>
      Boolean((window as unknown as { tf?: unknown; speechCommands?: unknown }).tf
        && (window as unknown as { speechCommands?: unknown }).speechCommands));
    await expect(page.locator('.words li')).toHaveCount(18);
    await expect(page.locator('.words li.accept')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Listen for 12 seconds' })).toBeDisabled();
  });

  test('serves the vendored model and library assets from this origin', async ({ page }) => {
    for (const path of [
      '/voice-lab/model/model.json',
      '/voice-lab/model/metadata.json',
      '/voice-lab/model/group1-shard1of2',
      '/voice-lab/model/group1-shard2of2',
      '/voice-lab/vendor/tf.min.js',
      '/voice-lab/vendor/speech-commands.min.js',
    ]) {
      const response = await page.request.get(path);
      expect(response.ok(), `${path} served`).toBeTruthy();
    }
  });

  test('prepares the local receiver with a TensorFlow backend and the same-origin model', async ({ page }) => {
    await page.goto('/voice-lab/');
    await page.getByRole('button', { name: 'Prepare receiver' }).click();
    await expect(page.locator('#state')).toContainText('Receiver ready', { timeout: 90_000 });
    await expect(page.locator('#capability')).toContainText('TensorFlow backend:');
    await expect(page.getByRole('button', { name: 'Listen for 12 seconds' })).toBeEnabled();
  });
});
