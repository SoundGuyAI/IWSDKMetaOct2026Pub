import { expect, test, type Page } from '@playwright/test';

import { MovementTracker, MOVE_DEAD_ZONE_M } from '../../src/wall-tones/movement.js';

/**
 * Movement research E2E (backlog 30): the tracker math runs against the real
 * module, and the desktop page proves the MR-only menu line stays hidden in
 * flat play and that flat presses never count as pad reach. Actual headset
 * movement values need an on-device Quest check (see
 * MOVEMENT_TRACKING_RESEARCH.md); no desktop run can prove them.
 */

test('tracker logic: a walk counts, sway and re-centering jumps do not', () => {
  const t = new MovementTracker();
  const FPS = 1 / 60;
  let now = 0;
  // 2cm sinusoidal sway at 60fps stays inside the dead-zone.
  for (let i = 0; i < 120; i++) {
    now += FPS;
    t.noteHeadPosition(Math.sin(i / 10) * 0.02, 1.6, 0, true, now);
  }
  expect(t.getSessionHeadMeters() < MOVE_DEAD_ZONE_M).toBe(true);
  // A straight 2 m walk at 1.2 m/s counts within dead-zone tolerance.
  for (let i = 1; i <= 100; i++) {
    now += FPS;
    t.noteHeadPosition(i * 0.02, 1.6, 0, true, now);
  }
  expect(t.getSessionHeadMeters()).toBeGreaterThan(1.9);
  // A 10 m single-frame jump (re-center / tracking loss) counts nothing.
  const before = t.getSessionHeadMeters();
  now += FPS;
  t.noteHeadPosition(12, 1.6, 0, true, now);
  expect(t.getSessionHeadMeters()).toBe(before);
});

interface MovementSnap {
  phase: string;
  sequence: number[];
  inputStep: number;
  scoreInfoVisible: boolean;
  movementRowVisible: boolean;
  movementSessionHeadMeters: number;
  movementSessionPadMeters: number;
  movementLifetimeMeters: number;
}

const readState = (page: Page): Promise<MovementSnap> =>
  page.evaluate(() => {
    const d = (window as unknown as { __wallTonesDebug: MovementSnap })
      .__wallTonesDebug;
    return {
      phase: d.phase,
      sequence: [...d.sequence],
      inputStep: d.inputStep,
      scoreInfoVisible: d.scoreInfoVisible,
      movementRowVisible: d.movementRowVisible,
      movementSessionHeadMeters: d.movementSessionHeadMeters,
      movementSessionPadMeters: d.movementSessionPadMeters,
      movementLifetimeMeters: d.movementLifetimeMeters,
    };
  });

const submitPad = (page: Page, padIndex: number): Promise<void> =>
  page.evaluate(
    (index) =>
      (window as unknown as { __wallTonesDebug: { submitPad(i: number): void } })
        .__wallTonesDebug.submitPad(index),
    padIndex,
  );

/** Fail every clip fast; gameplay lines settle instantly (economy spec pattern). */
async function abortSpeech(page: Page): Promise<void> {
  await page.route('**/audio/speech/**', (route) => route.abort());
}

test('flat play hides the MR movement line and counts no movement', async ({ page }) => {
  await abortSpeech(page);
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
  // Desktop boot: the first tap starts flat play (economy spec pattern),
  // then reach the input phase and press the correct pad.
  await submitPad(page, 0);
  await expect
    .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
    .toBe('input');
  const snap = await readState(page);
  await submitPad(page, snap.sequence[snap.inputStep]!);
  const after = await readState(page);
  // Score rows show in flat play, but the movement line is MR-only.
  expect(after.scoreInfoVisible).toBe(true);
  expect(after.movementRowVisible).toBe(false);
  // Flat pads are a fixed on-screen grid: no head movement, no pad reach.
  expect(after.movementSessionHeadMeters).toBe(0);
  expect(after.movementSessionPadMeters).toBe(0);
  expect(after.movementLifetimeMeters).toBe(0);
});
