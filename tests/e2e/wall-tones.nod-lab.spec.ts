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
  // Fourth stacked button on the centred menu panel; positions verified
  // against a local screenshot (1280x800 viewport).
  await page.mouse.click(640, 535);
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

test('full dialogue: yes path walks intro -> q2 -> q3 -> done with echoes', async ({
  page,
}) => {
  await page.mouse.click(640, 535);
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
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'q3');
  await answer(page, 'yes');
  await waitPhase(page, 'done');
  snapshot = await bridge(page);
  expect(snapshot?.answerCount).toBe(3);
});

test('intro no loops through the retry line until a yes', async ({ page }) => {
  await page.mouse.click(640, 535);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'intro');
  const snapshot = await bridge(page);
  expect(snapshot?.lastAnswer).toBe('no');
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
});

test('keyboard fallback answers work in flat mode (Y/N keys)', async ({
  page,
}) => {
  await page.mouse.click(640, 535);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __nodLabDebug: { start: () => void } }).__nodLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  const snapshot = await bridge(page);
  // Flat sessions never arm the head detector; buttons/keys are the answer path.
  expect(snapshot?.detectorArmed).toBe(false);
  await page.keyboard.press('n');
  await waitPhase(page, 'listening', 'intro');
  const after = await bridge(page);
  expect(after?.lastAnswer).toBe('no');
  await page.keyboard.press('y');
  await waitPhase(page, 'listening', 'q2');
});
