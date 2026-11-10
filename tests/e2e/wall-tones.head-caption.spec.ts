import { expect, test, type Page } from '@playwright/test';

/**
 * MR head-locked caption rendering (backlog 21 / PR25 empty-caption bug):
 * uikitml compiles a Text child only for elements that start with text;
 * on an initially empty element setProperties({ text }) silently no-ops.
 * These checks read the RENDERED text back through the debug bridge, so
 * they fail if the caption markup ever loses its seed text - static
 * markup assertions alone cannot catch the trap. Flat boot is enough:
 * the scene asset compiles on load even outside an immersive session.
 */

const readCaption = (page: Page): Promise<string | null> =>
  page.evaluate(
    () =>
      (window as unknown as {
        __wallTonesDebug: { headCaptionVisibleText: string | null };
      }).__wallTonesDebug.headCaptionVisibleText,
  );

const probeCaption = (page: Page, text: string): Promise<void> =>
  page.evaluate(
    (t) =>
      (window as unknown as {
        __wallTonesDebug: { probeHeadCaptionText(text: string): void };
      }).__wallTonesDebug.probeHeadCaptionText(t),
    text,
  );

async function bootWallTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    window.localStorage.clear();
  });
  await page.goto('/');
  await page.waitForFunction(
    () =>
      Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
    undefined,
    { timeout: 60_000 },
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as {
              __wallTonesDebug: { flatAwaitingStart: boolean };
            }).__wallTonesDebug.flatAwaitingStart,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
}

test('head-locked caption compiles a Text child and renders set text', async ({
  page,
}) => {
  await bootWallTones(page);
  // Seeded initial literal proves the Text child compiled (null = trap).
  await expect.poll(() => readCaption(page)).toBe('...');
  // Drive the exact setter path tickHeadCaption uses and read the
  // rendered text back.
  await probeCaption(page, 'Probe caption line');
  await expect.poll(() => readCaption(page)).toBe('Probe caption line');
});
