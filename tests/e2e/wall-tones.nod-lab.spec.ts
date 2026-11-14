import { expect, test } from '@playwright/test';

/**
 * Nod yes/no lab (backlog item 52). Flat-mode e2e: real canvas click on the
 * main-menu lab button, then the dialogue is driven through the
 * window.__nodLabDebug bridge (fallback answers stand in for head gestures,
 * which need an immersive session). Clips are not published yet, so lines
 * advance on caption reading time - that exercises the same flow the headset
 * uses once the Cypher voice lands.
 */

type Snapshot = {
  phase: string;
  promptId: string | null;
  lastAnswer: string | null;
  detectorArmed: boolean;
  immersive: boolean;
  voiceStatus: string;
  answerCount: number;
  cueCount: number;
  noInputCount: number;
  clipPlays: Record<string, number>;
};

const bridge = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const debug = (
      window as unknown as {
        __nodLabDebug?: {
          snapshot: () => Snapshot;
          start: () => void;
          answer: (a: 'yes' | 'no') => void;
        };
      }
    ).__nodLabDebug;
    return debug?.snapshot() ?? null;
  });

async function answer(page: import('@playwright/test').Page, value: 'yes' | 'no') {
  await page.evaluate((a) => {
    (
      window as unknown as {
        __nodLabDebug?: { answer: (x: 'yes' | 'no') => void };
      }
    ).__nodLabDebug?.answer(a);
  }, value);
}

async function waitPhase(
  page: import('@playwright/test').Page,
  phase: string,
  promptId?: string,
) {
  await page.waitForFunction(
    ([wantedPhase, wantedPrompt]) => {
      const snapshot = (
        window as unknown as {
          __nodLabDebug?: { snapshot: () => Snapshot };
        }
      ).__nodLabDebug?.snapshot();
      return (
        snapshot?.phase === wantedPhase &&
        (wantedPrompt == null || snapshot.promptId === wantedPrompt)
      );
    },
    [phase, promptId ?? null],
    { timeout: 60000 },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __labLineReadingMs?: number }).__labLineReadingMs = 30;
  });
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
});

test('main menu carries a working Nod Yes/No Lab button (real canvas click)', async ({
  page,
}) => {
  // Lab entry is a compact panel floating to the right of the menu (a
  // child node of main-menu-panel, so in-flow menu geometry and its
  // calibrated click targets stay untouched); position verified against a
  // local screenshot (1280x800 viewport).
  await page.mouse.click(1100, 320);
  await page.waitForFunction(
    () =>
      (window as unknown as { __nodLabDebug?: unknown }).__nodLabDebug != null &&
      (window as unknown as {
        __nodLabDebug: { snapshot: () => Snapshot };
      }).__nodLabDebug.snapshot().phase === 'idle',
    null,
    { timeout: 15000 },
  );
  const snapshot = await bridge(page);
  expect(snapshot?.immersive).toBe(false);
  expect(snapshot?.voiceStatus).toContain('Cypher voice:');
});

test('full dialogue: yes path walks intro -> q2 -> q3 -> done with answer cues', async ({
  page,
}) => {
  await page.mouse.click(1100, 320);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
  let snapshot = await bridge(page);
  expect(snapshot?.lastAnswer).toBe('yes');
  expect(snapshot?.answerCount).toBe(1);
  // Regression (Nov 14 Quest test): the q2 line must play exactly once -
  // the intro yes-branch used to speak it and then playPrompt repeated it.
  expect(snapshot?.clipPlays['q2']).toBe(1);
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'q3');
  await answer(page, 'yes');
  await waitPhase(page, 'done');
  snapshot = await bridge(page);
  expect(snapshot?.answerCount).toBe(3);
  expect(snapshot?.clipPlays['q2']).toBe(1);
  // Each answer played one recognition cue instead of a spoken yes/no echo;
  // the echo clips are never spoken in the lab flow anymore.
  expect(snapshot?.cueCount).toBe(3);
  expect(snapshot?.clipPlays['yes'] ?? 0).toBe(0);
  expect(snapshot?.clipPlays['no'] ?? 0).toBe(0);
});

test('intro no loops through the retry line until a yes', async ({ page }) => {
  await page.mouse.click(1100, 320);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'retry');
  let snapshot = await bridge(page);
  expect(snapshot?.lastAnswer).toBe('no');
  // The full connection-check intro must not replay after a no.
  expect(snapshot?.clipPlays['intro-nod'] ?? 0).toBe(1);
  // Approved Nov 14: a second no rotates to the first variation clip.
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'retry');
  snapshot = await bridge(page);
  expect(snapshot?.clipPlays['retry-nod'] ?? 0).toBe(1);
  expect(snapshot?.clipPlays['retry-2'] ?? 0).toBe(1);
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
});

test('keyboard fallback answers work in flat mode (Y/N keys)', async ({
  page,
}) => {
  await page.mouse.click(1100, 320);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  const snapshot = await bridge(page);
  // Flat sessions never arm the head detector; buttons/keys are the answer path.
  expect(snapshot?.detectorArmed).toBe(false);
  await page.keyboard.press('n');
  await waitPhase(page, 'listening', 'retry');
  const after = await bridge(page);
  expect(after?.lastAnswer).toBe('no');
  await page.keyboard.press('y');
  await waitPhase(page, 'listening', 'q2');
});

test('no input inside the 6s answer window re-asks the same prompt', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.mouse.click(1100, 320);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');

  // Say nothing. After ~6s Cypher acknowledges the silence (no cue, not an
  // answer) and the same prompt is armed again.
  await page.waitForFunction(
    () => {
      const snapshot = (
        window as unknown as {
          __nodLabDebug?: { snapshot: () => Snapshot };
        }
      ).__nodLabDebug?.snapshot();
      return snapshot?.noInputCount === 1;
    },
    null,
    { timeout: 20000 },
  );
  const silent = await bridge(page);
  expect(silent?.answerCount).toBe(0);
  expect(silent?.cueCount).toBe(0);
  expect(silent?.clipPlays['no-input-1']).toBe(1);
  await waitPhase(page, 'listening', 'intro');

  // The dialogue still answers normally afterwards.
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
  const after = await bridge(page);
  expect(after?.lastAnswer).toBe('yes');
  expect(after?.answerCount).toBe(1);
});

test('flat mode: mouse drag gestures answer without buttons (up-down = yes, left-right = no)', async ({
  page,
}) => {
  await page.mouse.click(1100, 320);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');

  // Rest the pointer so the tracker re-anchors, then swing down and back up.
  // The moves are dispatched in-page: CDP mouse.move costs ~400ms per step in
  // headless Chromium, which would stretch the out-and-back past the
  // detector's 1.4s gesture window. The real window pointermove listener,
  // tracker, detector and submitAnswer path are all exercised.
  const swing = (dx: number, dy: number) =>
    page.evaluate(
      ([sx, sy]) =>
        (async () => {
          const fire = (x: number, y: number) =>
            window.dispatchEvent(
              new PointerEvent('pointermove', { clientX: x, clientY: y }),
            );
          for (let i = 1; i <= 6; i += 1) {
            fire(640 + (sx * i) / 6, 400 + (sy * i) / 6);
            await new Promise((r) => setTimeout(r, 30));
          }
          for (let i = 5; i >= 0; i -= 1) {
            fire(640 + (sx * i) / 6, 400 + (sy * i) / 6);
            await new Promise((r) => setTimeout(r, 30));
          }
        })(),
      [dx, dy],
    );
  await page.mouse.move(640, 400, { steps: 5 });
  await page.waitForTimeout(800);
  await swing(0, 110);
  await waitPhase(page, 'listening', 'q2');
  let snapshot = await bridge(page);
  expect(snapshot?.lastAnswer).toBe('yes');
  expect(snapshot?.answerCount).toBe(1);
  expect(snapshot?.cueCount).toBe(1);

  // Swing left and back for no on the q2 prompt. The wait covers the
  // detector cooldown (1.2s) and re-anchors the pointer baseline.
  await page.waitForTimeout(1500);
  await swing(-110, 0);
  await page.waitForFunction(
    () => {
      const s = (
        window as unknown as { __nodLabDebug?: { snapshot: () => Snapshot } }
      ).__nodLabDebug?.snapshot();
      return s?.lastAnswer === 'no' && s?.answerCount === 2;
    },
    null,
    { timeout: 15000 },
  );
  snapshot = await bridge(page);
  expect(snapshot?.cueCount).toBe(2);
});
