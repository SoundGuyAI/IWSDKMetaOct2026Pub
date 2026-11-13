import { expect, test } from '@playwright/test';
import { CLIP_TRANSCRIPTS } from '../../src/wall-tones/clip-transcripts.js';
import { WALL_TONES_CLIP_FILES } from '../../src/wall-tones/speech.js';
import { startSpokenCaption, endSpokenCaption, currentSpokenCaption } from '../../src/wall-tones/accessibility.js';

test('each shipped voice clip has a subtitle, stale completions cannot clear newer captions', () => {
  expect(Object.keys(CLIP_TRANSCRIPTS).sort()).toEqual(Object.keys(WALL_TONES_CLIP_FILES).sort());
  const old = startSpokenCaption('first');
  const current = startSpokenCaption('second');
  endSpokenCaption(old); expect(currentSpokenCaption()).toBe('second');
  endSpokenCaption(current); expect(currentSpokenCaption()).toBe('');
});

test('subtitles are off by default, enabled phone info sits below pads with color names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('iwsdk-experience-mode', 'walltones'));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__wallTonesDebug?.flatAwaitingStart);
  await expect(page.locator('#wall-tones-flat-subtitles')).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem('wall-tones-hearing-subtitles', 'true');
    localStorage.setItem('wall-tones-color-names', 'true');
  });
  await expect(page.locator('#wall-tones-flat-subtitles')).toBeVisible();
  // The Listen-phase sequence strip (and its color names) needs the Listen
  // store item (owner rule 2026-11-11: no Listen item, no listen line).
  // The "Hint:" title and the Your Turn boxes need the owned hint (owner
  // ask 2026-11-12: titles hidden until bought), so buy Listen AND Hint L1.
  await page.evaluate(() => {
    const d = (window as any).__wallTonesDebug;
    d.grantBars(60);
    d.buyListen();
    d.buyHint();
  });
  await page.evaluate(() => (window as any).__wallTonesDebug.submitPad(0));
  await page.waitForFunction(() => (window as any).__wallTonesDebug.phase === 'input', undefined, { timeout: 90000 });
  await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Hint:');
  await expect(page.locator('#wall-tones-flat-subtitles')).toContainText(/green|red|blue|yellow/);
  const box = await page.locator('#wall-tones-flat-subtitles').boundingBox();
  expect(box!.y).toBeGreaterThan(720); expect(box!.y + box!.height).toBeLessThan(844);
  await page.evaluate(() => localStorage.setItem('wall-tones-hearing-subtitles', 'false'));
  await expect(page.locator('#wall-tones-flat-subtitles')).toBeHidden();
});
