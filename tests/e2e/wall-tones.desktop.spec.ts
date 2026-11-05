import { expect, test, type Page } from '@playwright/test';

/**
 * Desktop E2E for Wall Tones (flat / non-XR path).
 *
 * Plan and manual checklist: docs/WALL_TONES_DESKTOP_TEST_PLAN.md.
 * Driving model: the in-page window.__wallTonesDebug bridge published by
 * WallTonesSystem (src/wall-tones/wall-tones-system.ts). 3D uikit panels are
 * not DOM-clickable in headless runs, so game input goes through the bridge
 * and entry uses the same sessionStorage mode the menu button persists.
 */

interface DebugSnapshot {
  phase: string;
  flowPhase: string;
  sequence: number[];
  inputStep: number;
  streak: number;
  bestStreak: number;
  flatAwaitingStart: boolean;
}

const readDebug = (page: Page): Promise<DebugSnapshot> =>
  page.evaluate(() => {
    const d = (window as unknown as { __wallTonesDebug: DebugSnapshot })
      .__wallTonesDebug;
    return {
      phase: d.phase,
      flowPhase: d.flowPhase,
      sequence: [...d.sequence],
      inputStep: d.inputStep,
      streak: d.streak,
      bestStreak: d.bestStreak,
      flatAwaitingStart: d.flatAwaitingStart,
    };
  });

const submitPad = (page: Page, padIndex: number): Promise<void> =>
  page.evaluate(
    (index) =>
      (window as unknown as { __wallTonesDebug: { submitPad(i: number): void } })
        .__wallTonesDebug.submitPad(index),
    padIndex,
  );

async function waitForPhase(page: Page, phase: string): Promise<void> {
  await expect
    .poll(async () => (await readDebug(page)).phase, { timeout: 90_000 })
    .toBe(phase);
}

/** Boot straight into Wall Tones flat mode (same mode the menu button persists). */
async function bootWallTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
  });
  await page.goto('/');
  await page.waitForFunction(
    () =>
      Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
    undefined,
    { timeout: 60_000 },
  );
  await expect
    .poll(async () => (await readDebug(page)).flatAwaitingStart, { timeout: 60_000 })
    .toBe(true);
}

/** Tap a pad to start, then wait out fanfare + spoken intro until input opens. */
async function startFlatPlay(page: Page): Promise<void> {
  await submitPad(page, 0);
  await expect
    .poll(async () => (await readDebug(page)).flatAwaitingStart)
    .toBe(false);
  await waitForPhase(page, 'input');
}

test.describe('Wall Tones desktop (flat mode)', () => {
  test('boots to the flat start state without page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await bootWallTones(page);
    expect(await page.title()).toBe('Wall Tones');
    const snap = await readDebug(page);
    expect(snap.flowPhase).toBe('playing');
    expect(snap.phase).toBe('idle');
    expect(snap.sequence).toHaveLength(0);
    expect(pageErrors).toEqual([]);
  });

  test('menu mode (no stored mode) boots clean and does not auto-start', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto('/');
    await page.waitForFunction(
      () =>
        Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
      undefined,
      { timeout: 60_000 },
    );
    expect(await page.title()).toBe('Wall Tones');
    const snap = await readDebug(page);
    expect(snap.flatAwaitingStart).toBe(false);
    expect(snap.phase).toBe('idle');
    expect(pageErrors).toEqual([]);
  });

  test('first pad tap starts fanfare + intro, then opens input on a 1-note run', async ({
    page,
  }) => {
    await bootWallTones(page);
    await startFlatPlay(page);
    const snap = await readDebug(page);
    expect(snap.sequence).toHaveLength(1);
    expect(snap.streak).toBe(0);
    expect(snap.inputStep).toBe(0);
  });

  test('correct input grows the run; a wrong pad resets the run but keeps best streak', async ({
    page,
  }) => {
    await bootWallTones(page);
    await startFlatPlay(page);

    // Complete the 1-note round.
    let snap = await readDebug(page);
    await submitPad(page, snap.sequence[0]!);
    await expect
      .poll(async () => {
        const s = await readDebug(page);
        return s.phase === 'input' && s.sequence.length === 2;
      })
      .toBe(true);
    snap = await readDebug(page);
    expect(snap.streak).toBe(1);
    expect(snap.bestStreak).toBe(1);

    // Wrong pad on the 2-note run: run resets, best streak survives.
    const wrong = (snap.sequence[snap.inputStep]! + 1) % 4;
    await submitPad(page, wrong);
    await waitForPhase(page, 'resetting');
    await expect
      .poll(async () => {
        const s = await readDebug(page);
        return s.phase === 'input' && s.sequence.length === 1;
      })
      .toBe(true);
    snap = await readDebug(page);
    expect(snap.streak).toBe(0);
    expect(snap.bestStreak).toBe(1);
  });

  test('stored voice choice controls which speech clips load', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
      window.localStorage.setItem('wall-tones-voice-gender', 'female');
    });
    const femaleClip = page.waitForRequest(
      (request) => request.url().includes('/audio/speech/female/'),
      { timeout: 60_000 },
    );
    await page.goto('/');
    await femaleClip;
    await page.waitForFunction(
      () =>
        Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
      undefined,
      { timeout: 60_000 },
    );
  });

  test('opening welcome includes the point-and-press line, and how-to-play does not repeat it', async ({
    page,
  }) => {
    // Record the duration of every decoded clip handed to Web Audio, in play order.
    await page.addInitScript(() => {
      const played: number[] = [];
      (window as unknown as { __played: number[] }).__played = played;
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer != null && this.buffer.duration > 1.5) {
          played.push(this.buffer.duration);
        }
        return orig.apply(this, args as never);
      };
    });
    await bootWallTones(page);
    const played = (): Promise<number[]> =>
      page.evaluate(() => [...(window as unknown as { __played: number[] }).__played]);
    // welcome (~5s) then point-and-press (~2s), in that order.
    await expect.poll(async () => (await played()).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    const opening = await played();
    expect(opening[0]!).toBeGreaterThan(4);
    expect(opening[1]!).toBeLessThan(3.5);
    await startFlatPlay(page);
    // The how-to-play remainder (~7s) follows; the full ~9s clip must not.
    await expect.poll(async () => (await played()).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    const all = await played();
    expect(all.some((d, i) => i >= 2 && d > 8.5)).toBe(false);
    expect(all.some((d, i) => i >= 2 && d > 6 && d < 8.5)).toBe(true);
  });

  test('reaching a 5-streak plays the milestone voice and continues the run @slow', async ({
    page,
  }) => {
    test.slow();
    await bootWallTones(page);
    await startFlatPlay(page);

    const milestone = page.waitForRequest(
      (request) => request.url().includes('/audio/speech/') && request.url().includes('milestone-5.mp3'),
      { timeout: 300_000 },
    );
    // Play correct rounds until the streak hits 5.
    for (let round = 0; round < 5; round += 1) {
      await waitForPhase(page, 'input');
      const snap = await readDebug(page);
      const note = snap.sequence[snap.inputStep]!;
      await submitPad(page, note);
      if (snap.inputStep + 1 < snap.sequence.length) {
        round -= 1; // multi-note round: keep stepping through the pattern
      }
    }
    await milestone;
    await expect
      .poll(async () => {
        const s = await readDebug(page);
        return s.phase === 'input' && s.sequence.length === 6;
      })
      .toBe(true);
  });
});
