import { expect, test } from '@playwright/test';

/**
 * Voice yes/no lab. Flat-mode e2e: real canvas click on the lab-menu Voice
 * row, then the dialogue is driven through the window.__voiceLabDebug
 * bridge (buttons/keys stand in for the microphone and feed() stands in for
 * model results). The six voice-lab-only clips (intro-voice, retry-voice,
 * noise-1..4, Kore/Algenib) ship with the lab, so most tests run in clip
 * mode with real audio pacing; the last test blocks the clip requests to
 * keep the silent text-preview mode covered (lines advance on caption
 * reading time, exactly as on a build without the clips).
 */

type Snapshot = {
  phase: string;
  promptId: string | null;
  lastAnswer: string | null;
  lastWord: string | null;
  lastScore: number | null;
  noiseCount: number;
  receiverState: string;
  threshold: number;
  listenWindowSec: number;
  voiceStatus: string;
  answerCount: number;
  cueCount: number;
  clipPlays: Record<string, number>;
};

type DebugBridge = {
  snapshot: () => Snapshot;
  start: () => void;
  answer: (a: 'yes' | 'no') => void;
  feed: (word: string, score: number) => void;
};

const debugOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const debug = (window as unknown as { __voiceLabDebug?: DebugBridge }).__voiceLabDebug;
    return debug?.snapshot() ?? null;
  });

async function answer(page: import('@playwright/test').Page, value: 'yes' | 'no') {
  await page.evaluate((a) => {
    (window as unknown as { __voiceLabDebug?: DebugBridge }).__voiceLabDebug?.answer(a);
  }, value);
}

async function feed(page: import('@playwright/test').Page, word: string, score: number) {
  await page.evaluate(
    ([w, s]) => {
      (window as unknown as { __voiceLabDebug?: DebugBridge }).__voiceLabDebug?.feed(w, s);
    },
    [word, score],
  );
}

async function waitPhase(
  page: import('@playwright/test').Page,
  phase: string,
  promptId?: string,
) {
  await page.waitForFunction(
    ([wantedPhase, wantedPrompt]) => {
      const snapshot = (
        window as unknown as { __voiceLabDebug?: DebugBridge }
      ).__voiceLabDebug?.snapshot();
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

/** Lab entry (floating button) -> Capability demos -> Voice Yes/No row. */
async function enterVoiceLab(page: import('@playwright/test').Page): Promise<void> {
  await page.mouse.click(1100, 320);
  await page.waitForTimeout(2000);
  // The Lab menu has four rows (Nod, Thumbs, Rift, Voice) plus Back; the
  // Voice row sits at y~493 on the 1280x800 viewport (calibrated against a
  // local screenshot in this PR's run).
  await page.mouse.move(640, 493);
  await page.mouse.click(640, 493);
}

test('main menu carries a working Voice Yes/No Lab row (real canvas click)', async ({
  page,
}) => {
  await enterVoiceLab(page);
  await page.waitForFunction(
    () =>
      (window as unknown as { __voiceLabDebug?: unknown }).__voiceLabDebug != null &&
      (window as unknown as {
        __voiceLabDebug: { snapshot: () => Snapshot };
      }).__voiceLabDebug.snapshot().phase === 'idle',
    null,
    { timeout: 15000 },
  );
  const snapshot = await debugOf(page);
  expect(snapshot?.voiceStatus).toContain('Cypher voice:');
  expect(snapshot?.threshold).toBe(0.8);
  expect(snapshot?.listenWindowSec).toBe(12);
});

test('receiver loads the on-device model; no mic means mic-unavailable, not a crash', async ({
  page,
}) => {
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  // The receiver prepares on Start; before that it is cold.
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  // Headless Chromium has no microphone: the vendored model still loads
  // (receiver reaches ready) and the listen attempt reports mic-unavailable.
  await page.waitForFunction(
    () => {
      const state = (window as unknown as { __voiceLabDebug?: DebugBridge })
        .__voiceLabDebug?.snapshot().receiverState;
      return state === 'ready' || state === 'mic-unavailable' || state === 'listening';
    },
    null,
    { timeout: 60000 },
  );
  const snapshot = await debugOf(page);
  expect(['mic-unavailable', 'listening', 'ready']).toContain(snapshot?.receiverState);
});

test('full dialogue: yes path walks intro -> q2 -> q3 -> done with answer cues', async ({
  page,
}) => {
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
  let snapshot = await debugOf(page);
  expect(snapshot?.lastAnswer).toBe('yes');
  expect(snapshot?.answerCount).toBe(1);
  expect(snapshot?.clipPlays['q2']).toBe(1);
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'q3');
  await answer(page, 'yes');
  await waitPhase(page, 'done');
  snapshot = await debugOf(page);
  expect(snapshot?.answerCount).toBe(3);
  expect(snapshot?.clipPlays['q2']).toBe(1);
  expect(snapshot?.cueCount).toBe(3);
  expect(snapshot?.clipPlays['yes'] ?? 0).toBe(0);
  expect(snapshot?.clipPlays['no'] ?? 0).toBe(0);
});

test('intro no loops through the retry line until a yes', async ({ page }) => {
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'retry');
  let snapshot = await debugOf(page);
  expect(snapshot?.lastAnswer).toBe('no');
  // The full connection-check intro must not replay after a no.
  expect(snapshot?.clipPlays['intro-voice'] ?? 0).toBe(1);
  await answer(page, 'no');
  await waitPhase(page, 'listening', 'retry');
  snapshot = await debugOf(page);
  expect(snapshot?.clipPlays['retry-voice'] ?? 0).toBe(1);
  expect(snapshot?.clipPlays['retry-2'] ?? 0).toBe(1);
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
});

test('fed model results: clear yes answers, other words count as noise', async ({ page }) => {
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  // Noise: an accepted non-answer word shows in telemetry but does not answer.
  await feed(page, 'left', 0.92);
  let snapshot = await debugOf(page);
  expect(snapshot?.phase).toBe('listening');
  expect(snapshot?.lastWord).toBe('left');
  expect(snapshot?.noiseCount).toBe(1);
  expect(snapshot?.answerCount).toBe(0);
  // Faint: a yes below the threshold does not answer either.
  await feed(page, 'yes', 0.5);
  snapshot = await debugOf(page);
  expect(snapshot?.phase).toBe('listening');
  expect(snapshot?.answerCount).toBe(0);
  // Clear yes answers.
  await feed(page, 'yes', 0.95);
  await waitPhase(page, 'listening', 'q2');
  snapshot = await debugOf(page);
  expect(snapshot?.lastAnswer).toBe('yes');
  expect(snapshot?.answerCount).toBe(1);
});

test('keyboard fallback answers work in flat mode (Y/N keys)', async ({ page }) => {
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await page.keyboard.press('n');
  await waitPhase(page, 'listening', 'retry');
  const after = await debugOf(page);
  expect(after?.lastAnswer).toBe('no');
  await page.keyboard.press('y');
  await waitPhase(page, 'listening', 'q2');
});

test('silent text-preview mode: with clips unreachable the dialogue still advances on captions', async ({
  page,
}) => {
  // Block every clip request so the lab takes its honest text-preview path
  // (panel says the Cypher voice is pending, lines pace on reading time
  // via the __labLineReadingMs override from beforeEach).
  await page.route('**/audio/speech/cypher-lab/**', (route) => route.abort());
  await enterVoiceLab(page);
  await waitPhase(page, 'idle');
  // The availability probe settles after the idle phase starts; poll instead
  // of snapshotting so a slow runner does not catch the 'checking...' state.
  await expect
    .poll(async () => (await debugOf(page))?.voiceStatus, { timeout: 15_000 })
    .toContain('pending');
  await page.evaluate(() =>
    (window as unknown as { __voiceLabDebug: DebugBridge }).__voiceLabDebug.start(),
  );
  await waitPhase(page, 'listening', 'intro');
  await answer(page, 'yes');
  await waitPhase(page, 'listening', 'q2');
  const snapshot = await debugOf(page);
  expect(snapshot?.lastAnswer).toBe('yes');
  expect(snapshot?.answerCount).toBe(1);
});
