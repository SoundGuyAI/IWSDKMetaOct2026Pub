import { expect, test, type Page } from '@playwright/test';

/**
 * Desktop E2E for the November 6 polish items:
 *  - backlog 9: pad lit<->dim transitions cross-fade in both directions
 *  - backlog 10: Skip voice button cancels playing / queued narration
 *
 * Driven through the window.__wallTonesDebug bridge like the other specs.
 */

interface PadFadeState {
  power: number;
  targetPower: number;
  scale: number;
  targetScale: number;
  colorDistance: number;
}

const flatAwaitingStart = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      (window as unknown as {
        __wallTonesDebug: { flatAwaitingStart: boolean };
      }).__wallTonesDebug.flatAwaitingStart,
  );

const speechBusy = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      (window as unknown as { __wallTonesDebug: { speechBusy: boolean } })
        .__wallTonesDebug.speechBusy,
  );

const padFade = (page: Page, padIndex: number): Promise<PadFadeState | null> =>
  page.evaluate(
    (index) =>
      (window as unknown as {
        __wallTonesDebug: { padFade(i: number): PadFadeState | null };
      }).__wallTonesDebug.padFade(index),
    padIndex,
  );

const submitPad = (page: Page, padIndex: number): Promise<void> =>
  page.evaluate(
    (index) =>
      (window as unknown as { __wallTonesDebug: { submitPad(i: number): void } })
        .__wallTonesDebug.submitPad(index),
    padIndex,
  );

const skipSpeech = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (window as unknown as { __wallTonesDebug: { skipSpeech(): void } })
      .__wallTonesDebug.skipSpeech(),
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
}

test.describe('Wall Tones polish: fade + skip voice', () => {
  test('skip voice cancels queued and playing narration', async ({ page }) => {
    await bootWallTones(page);
    // Entry queues the welcome + point-and-press lines in flat mode.
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    await skipSpeech(page);
    await expect.poll(() => speechBusy(page)).toBe(false);
    // Nothing new is queued afterwards: narration stays cancelled.
    await page.waitForTimeout(1_500);
    expect(await speechBusy(page)).toBe(false);
  });

  test('pad flash cross-fades in and back out instead of snapping', async ({
    page,
  }) => {
    await bootWallTones(page);
    await skipSpeech(page); // keep narration out of the timing picture
    await expect
      .poll(() => flatAwaitingStart(page), { timeout: 60_000 })
      .toBe(true);

    // The start tap flashes pad 0 for ~280 ms. Sample the whole window from
    // inside the page so slow headless frames cannot slip past the fade.
    await submitPad(page, 0);
    const samples: (PadFadeState | null)[] = await page.evaluate(async () => {
      const d = (window as unknown as {
        __wallTonesDebug: { padFade(i: number): PadFadeState | null };
      }).__wallTonesDebug;
      const out: (PadFadeState | null)[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        out.push(d.padFade(0));
        await new Promise((resolve) => setTimeout(resolve, 4));
      }
      return out;
    });
    const seen = samples.filter((s): s is PadFadeState => s != null);
    expect(seen.length).toBeGreaterThan(10);
    // The flash was really commanded (target grew).
    expect(seen.some((s) => s.targetScale > 1.1)).toBe(true);
    // Fade-in: intermediate scales appear between idle and the flash target.
    // A snap would only ever read exactly 1 or exactly the target.
    const midwayIn = seen.filter(
      (s) => s.targetScale > 1.1 && s.scale > 1.004 && s.scale < 1.1395,
    );
    expect(midwayIn.length).toBeGreaterThan(0);
    // Fade-out: after the flash releases, the pad eases back through
    // intermediate scales instead of snapping to 1.
    const midwayOut = seen.filter(
      (s) => s.targetScale === 1 && s.scale > 1.004 && s.scale < 1.1395,
    );
    expect(midwayOut.length).toBeGreaterThan(0);
    // Color cross-fades too: mid-transition the displayed color lags the target.
    expect(seen.some((s) => s.colorDistance > 0.01)).toBe(true);
    // Both fades settle: scale back to 1 and color converged.
    await expect
      .poll(async () => (await padFade(page, 0))!.scale, { timeout: 5_000 })
      .toBeLessThan(1.02);
    await expect
      .poll(async () => (await padFade(page, 0))!.colorDistance, {
        timeout: 5_000,
      })
      .toBeLessThan(0.05);
  });
});
