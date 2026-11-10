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

interface DebugSnap {
  phase: string;
  sequence: number[];
  inputStep: number;
}

const readState = (page: Page): Promise<DebugSnap> =>
  page.evaluate(() => {
    const d = (window as unknown as {
      __wallTonesDebug: {
        phase: string;
        sequence: number[];
        inputStep: number;
      };
    }).__wallTonesDebug;
    return {
      phase: d.phase,
      sequence: [...d.sequence],
      inputStep: d.inputStep,
    };
  });

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

  test('flat skip button floats bottom-right outside the panel and skips', async ({
    page,
  }) => {
    await bootWallTones(page);
    // Entry narration starts; the overlay appears outside the menu panel.
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    const button = page.locator('#wall-tones-skip-voice-flat');
    await expect(button).toBeVisible();

    // Bottom-right corner of the screen, inside a small edge margin.
    const box = await button.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeGreaterThan(viewport!.width - 40);
    expect(box!.y + box!.height).toBeGreaterThan(viewport!.height - 40);

    // Clicking the actual overlay button skips the narration and hides it.
    await button.click();
    await expect.poll(() => speechBusy(page)).toBe(false);
    await expect(button).toBeHidden();
  });

  test('flat skip button stays clear of the subtitle strip on a phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
      window.localStorage.clear();
      window.localStorage.setItem('wall-tones-hearing-subtitles', 'true');
    });
    await page.goto('/');
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __wallTonesDebug?: unknown })
            .__wallTonesDebug,
        ),
      undefined,
      { timeout: 60_000 },
    );
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    const button = page.locator('#wall-tones-skip-voice-flat');
    await expect(button).toBeVisible();
    // With the bottom subtitle strip up, the corner has no safe room: the
    // button must sit fully above the strip (never overlapping it).
    const gap = await page.evaluate(() => {
      const b = document
        .getElementById('wall-tones-skip-voice-flat')!
        .getBoundingClientRect();
      const strip = document.getElementById('wall-tones-flat-subtitles');
      if (strip == null || strip.style.display === 'none') return null;
      const s = strip.getBoundingClientRect();
      return s.top - b.bottom;
    });
    expect(gap).not.toBeNull();
    expect(gap!).toBeGreaterThan(0);
  });

  test('pad flash cross-fades in and back out instead of snapping', async ({
    page,
  }) => {
    // Install before startup so the renderer captures controlled RAF/timers.
    await page.clock.install();
    await bootWallTones(page);
    await skipSpeech(page); // keep narration out of the timing picture
    await expect
      .poll(() => flatAwaitingStart(page), { timeout: 60_000 })
      .toBe(true);

    // Advance to a future page-clock instant, not the host clock (which may lag).
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10_000));
    await submitPad(page, 0);
    const samples: (PadFadeState | null)[] = [await padFade(page, 0)];
    for (let frame = 0; frame < 60; frame++) {
      await page.clock.runFor(16);
      samples.push(await padFade(page, 0));
    }
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
    await page.clock.runFor(1000);
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

  // Regression for codex finding: a line stuck awaiting a cold-cache clip
  // decode kept the Skip voice button visible after cancel().
  test('skip clears busy even while the clip is still decoding', async ({
    page,
  }) => {
    // Stall every clip fetch so the skip lands mid-decode.
    await page.route('**/audio/speech/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    await bootWallTones(page);
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    await skipSpeech(page);
    // Busy must drop at once even though the fetch/decode is still stalled.
    await expect.poll(() => speechBusy(page), { timeout: 1_500 }).toBe(false);
    // Outlast the delayed fetch: nothing may re-set the busy state.
    await page.waitForTimeout(5_000);
    expect(await speechBusy(page)).toBe(false);
  });

  // Regression for codex finding: skipping a multi-line scripted announcement
  // (streak-5 milestone) let the callback resume and queue the cheer, so
  // narration restarted after the skip.
  test('skip during a milestone swallows the remaining scripted lines', async ({
    page,
  }) => {
    test.slow();
    const cheerRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/audio/speech/') &&
        request.url().includes('/cheer-')
      ) {
        cheerRequests.push(request.url());
      }
    });
    await bootWallTones(page);
    await skipSpeech(page); // entry lines out of the timing picture
    await submitPad(page, 0); // start tap: flash + first round

    // Play correct rounds until the streak hits 5 (pattern from desktop.spec).
    for (let round = 0; round < 5; round += 1) {
      await expect
        .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
        .toBe('input');
      const snap = await readState(page);
      await submitPad(page, snap.sequence[snap.inputStep]!);
      if (snap.inputStep + 1 < snap.sequence.length) {
        round -= 1; // multi-note round: keep stepping through the pattern
      }
    }

    // The milestone line starts; skip it mid-announcement.
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    const cheersBefore = cheerRequests.length;
    await skipSpeech(page);
    await expect.poll(() => speechBusy(page)).toBe(false);

    // Round flow still advances to round 6 (skip must not break the game)...
    await expect
      .poll(
        async () => {
          const s = await readState(page);
          return s.phase === 'input' && s.sequence.length === 6;
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    // ...but the scripted cheer after the milestone was never fetched/played.
    expect(cheerRequests.length).toBe(cheersBefore);
    expect(await speechBusy(page)).toBe(false);
  });

  // Regression for codex finding: cancel() cleared the Skip voice busy state
  // but left the superseded speakAsync() promise suspended on the stalled
  // decode, so the round flow stayed stuck until the fetch completed.
  test('skip during a stalled milestone still lets the round flow resume', async ({
    page,
  }) => {
    test.slow();
    // Stall only the streak-5 milestone clip; every other clip plays normally.
    await page.route('**/audio/speech/**/milestone-5.mp3', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      await route.continue();
    });
    await bootWallTones(page);
    await skipSpeech(page); // entry lines out of the timing picture
    await submitPad(page, 0); // start tap: flash + first round

    // Play correct rounds until the streak hits 5 (pattern from desktop.spec).
    for (let round = 0; round < 5; round += 1) {
      await expect
        .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
        .toBe('input');
      const snap = await readState(page);
      await submitPad(page, snap.sequence[snap.inputStep]!);
      if (snap.inputStep + 1 < snap.sequence.length) {
        round -= 1; // multi-note round: keep stepping through the pattern
      }
    }

    // The milestone line starts; its fetch is now stalled for 12s. Skip it.
    await expect.poll(() => speechBusy(page), { timeout: 60_000 }).toBe(true);
    await skipSpeech(page);
    expect(await speechBusy(page)).toBe(false);

    // The round flow must not wait on the stalled fetch: the next pattern
    // plays and input opens well before the 12s stall would elapse.
    await expect
      .poll(
        async () => {
          const s = await readState(page);
          return s.phase === 'input' && s.sequence.length === 6;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });
});
