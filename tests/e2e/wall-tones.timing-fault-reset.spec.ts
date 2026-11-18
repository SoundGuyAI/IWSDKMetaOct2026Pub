import { test, expect, type Page } from '@playwright/test';


async function boot(page: Page, nextWindow: number, savers = 2) {
  await page.addInitScript((next) => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    localStorage.setItem('wall-tones-cypher-act1-progress-v1', JSON.stringify({ version: 1, next }));
    localStorage.removeItem('wall-tones-cypher-background-progress-v1');
    localStorage.setItem('wall-tones-voice-gender', 'male');
  }, nextWindow);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__wallTonesDebug?.flatAwaitingStart);
  await page.evaluate((n) => { (window as any).__wallTonesDebug.grantSavers(n); (window as any).__wallTonesDebug.grantBars(40); }, savers);
  await page.evaluate(() => (window as any).__wallTonesDebug.skipSpeech());
  await page.evaluate(() => (window as any).__wallTonesDebug.submitPad(0));
}

async function awaitInput(page: Page) {
  await page.waitForFunction(() => (window as any).__wallTonesDebug?.phase === 'input');
}

async function completePattern(page: Page) {
  await awaitInput(page);
  const sequence: number[] = await page.evaluate(() => [...(window as any).__wallTonesDebug.sequence]);
  for (const pad of sequence) {
    await awaitInput(page);
    await page.evaluate((p) => (window as any).__wallTonesDebug.submitPad(p), pad);
  }
}

/** Completes the first pattern, then waits through the story window to the next input. */
async function firstPatternThenNextInput(page: Page, expectedWindows: number) {
  await completePattern(page);
  await page.waitForFunction((n) => (window as any).__wallTonesDebug?.cypherWindowsStarted === n, expectedWindows, { timeout: 90_000 });
  await awaitInput(page);
  return page.evaluate(() => {
    const d = (window as any).__wallTonesDebug;
    return { len: d.sequence.length, streak: d.streak, best: d.bestStreak, savers: d.savers, bars: d.bars, windows: d.cypherWindowsStarted };
  });
}

test.describe('timing-fault pattern reset', () => {
  test.setTimeout(180_000);

  test('the "found a timing fault" beat restarts at one note and keeps streak, bars, story progress and savers', async ({ page }) => {
    await boot(page, 9);
    await completePattern(page); // pattern 1 (streak 1) -> N02/N03 window
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.cypherWindowsStarted === 10, undefined, { timeout: 90_000 });
    await awaitInput(page);
    const after = await page.evaluate(() => {
      const d = (window as any).__wallTonesDebug;
      return { len: d.sequence.length, streak: d.streak, best: d.bestStreak, savers: d.savers, bars: d.bars, windows: d.cypherWindowsStarted };
    });
    expect(after.len).toBe(1); // a second pattern would be 2 notes without the reset
    expect(after.streak).toBe(1); // earned streak kept
    expect(after.best).toBeGreaterThanOrEqual(1);
    expect(after.windows).toBe(10); // story progress advanced, not rewound
    expect(after.savers).toBe(2); // owned savers neither used nor restored
    expect(after.bars).toBeGreaterThanOrEqual(40);
    const barsBefore = after.bars;
    // Repeated reset control: the next window (seam, needs streak 15) does not fire, so the
    // following pattern grows normally and the streak keeps counting from the kept value.
    await completePattern(page);
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.phase === 'input' && (window as any).__wallTonesDebug.sequence.length === 2, undefined, { timeout: 90_000 });
    const next = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { len: d.sequence.length, streak: d.streak, windows: d.cypherWindowsStarted, savers: d.savers, bars: d.bars }; });
    expect(next.len).toBe(2);
    expect(next.streak).toBe(2);
    expect(next.windows).toBe(10);
    expect(next.savers).toBe(2);
    expect(next.bars).toBeGreaterThanOrEqual(barsBefore);
    await page.screenshot({ path: test.info().outputPath('after-timing-fault-reset.png') });
  });

  test('a wrong note after the reset restarts the run normally', async ({ page }) => {
    await boot(page, 9);
    await completePattern(page);
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.cypherWindowsStarted === 10, undefined, { timeout: 90_000 });
    await awaitInput(page);
    const seq: number[] = await page.evaluate(() => [...(window as any).__wallTonesDebug.sequence]);
    expect(seq).toHaveLength(1);
    await page.evaluate((p) => (window as any).__wallTonesDebug.submitPad((p + 1) % 4), seq[0]!);
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.gameOverOpen === true, undefined, { timeout: 30_000 });
    await page.evaluate(() => (window as any).__wallTonesDebug.gameOverNewRun());
    await page.waitForFunction(() => { const d = (window as any).__wallTonesDebug; return d.gameOverOpen === false && d.streak === 0; }, undefined, { timeout: 30_000 });
    const state = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { streak: d.streak, len: d.sequence.length, savers: d.savers }; });
    expect(state.streak).toBe(0); // a failed pattern after the reset ends the run as usual
    expect(state.len).toBe(1);
    expect(state.savers).toBe(2); // starting a new run does not consume owned savers
  });

  test('negative control: first-fault window (N01, "small glitch") does not reset', async ({ page }) => {
    await boot(page, 4);
    const s = await firstPatternThenNextInput(page, 5);
    expect(s.len).toBe(2);
    expect(s.streak).toBe(1);
    expect(s.savers).toBe(2);
  });

  test('negative control: last-check window (N06/N07) does not reset', async ({ page }) => {
    await boot(page, 13);
    const s = await firstPatternThenNextInput(page, 14);
    expect(s.len).toBe(2);
    expect(s.streak).toBe(1);
    expect(s.savers).toBe(2);
  });

  test('negative control: a Cypher window (your-machine) does not reset', async ({ page }) => {
    await boot(page, 6);
    const s = await firstPatternThenNextInput(page, 7);
    expect(s.len).toBe(2);
    expect(s.streak).toBe(1);
  });
});
