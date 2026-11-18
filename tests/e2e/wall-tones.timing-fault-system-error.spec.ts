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
    return { len: d.sequence.length, streak: d.streak, best: d.bestStreak, savers: d.savers, bars: d.bars, windows: d.cypherWindowsStarted, over: d.gameOverOpen, sysErr: d.systemErrorGameOver };
  });
}

/** Completes pattern 1 on the N02/N03 window and waits for the system-error Game Over. */
async function reachSystemError(page: Page) {
  await completePattern(page);
  await page.waitForFunction(() => (window as any).__wallTonesDebug?.systemErrorGameOver === true && (window as any).__wallTonesDebug?.gameOverOpen === true, undefined, { timeout: 120_000 });
}

test.describe('timing-fault system error', () => {
  test.setTimeout(240_000);

  test('the "found a timing fault" beat shows a system-error celebration, then the error Game Over, with no award and no saver use', async ({ page }) => {
    await boot(page, 9);
    const achievementsBefore = await page.evaluate(() => JSON.stringify((window as any).__wallTonesDebug.unlockedAchievements));
    await completePattern(page); // pattern 1 (streak 1) -> N02/N03 window
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.celebrationText?.startsWith('SYSTEM ERROR|'), undefined, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.celebrationText)).toBe('SYSTEM ERROR|Timing fault in the corrupt code. Possible hack.');
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.celebrationSfxPlays)).toBe(0); // no achievement unlock sound
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.gameOverOpen)).toBe(false); // panel waits for the visual
    await page.waitForTimeout(1450);
    await page.evaluate(() => (window as any).__wallTonesDebug.setCelebrationFrozen(true));
    await page.waitForTimeout(100);
    await page.screenshot({ path: test.info().outputPath('system-error-celebration.png') });
    await page.evaluate(() => (window as any).__wallTonesDebug.setCelebrationFrozen(false));
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.gameOverOpen === true, undefined, { timeout: 60_000 });
    const s = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { sysErr: d.systemErrorGameOver, streak: d.streak, best: d.bestStreak, savers: d.savers, bars: d.bars, windows: d.cypherWindowsStarted, ach: JSON.stringify(d.unlockedAchievements), celebrating: d.celebrationActive }; });
    expect(s.sysErr).toBe(true);
    expect(s.celebrating).toBe(false);
    expect(s.savers).toBe(2); // nothing consumed automatically
    expect(s.bars).toBeGreaterThanOrEqual(40);
    expect(s.best).toBeGreaterThanOrEqual(1);
    expect(s.windows).toBe(10); // story progress kept, not rewound
    expect(s.ach).toBe(achievementsBefore); // display only: nothing awarded
    await page.screenshot({ path: test.info().outputPath('system-error-gameover.png') });
  });

  test('New run after the system error starts over, keeps savers, and the beat does not repeat', async ({ page }) => {
    await boot(page, 9);
    await reachSystemError(page);
    await page.evaluate(() => (window as any).__wallTonesDebug.gameOverNewRun());
    await page.waitForFunction(() => { const d = (window as any).__wallTonesDebug; return d.gameOverOpen === false && d.streak === 0 && d.phase === 'input'; }, undefined, { timeout: 60_000 });
    let st = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { savers: d.savers, windows: d.cypherWindowsStarted, sysErr: d.systemErrorGameOver }; });
    expect(st.savers).toBe(2);
    expect(st.sysErr).toBe(false);
    expect(st.windows).toBe(10);
    // Climb back past the same pattern: story window is heard, so no second error.
    await completePattern(page);
    await page.waitForFunction(() => (window as any).__wallTonesDebug?.phase === 'input' && (window as any).__wallTonesDebug.sequence.length === 2, undefined, { timeout: 90_000 });
    st = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { savers: d.savers, windows: d.cypherWindowsStarted, sysErr: d.systemErrorGameOver }; });
    expect(st.sysErr).toBe(false);
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.gameOverOpen)).toBe(false);
    expect(st.savers).toBe(2);
  });

  test('a voluntary saver retry after the system error spends savers as a normal Game Over does and replays the pattern', async ({ page }) => {
    await boot(page, 9);
    await reachSystemError(page);
    await page.evaluate(() => (window as any).__wallTonesDebug.gameOverUseSaver());
    await page.waitForFunction(() => { const d = (window as any).__wallTonesDebug; return d.gameOverOpen === false && d.phase === 'input'; }, undefined, { timeout: 60_000 });
    const st = await page.evaluate(() => { const d = (window as any).__wallTonesDebug; return { savers: d.savers, streak: d.streak, windows: d.cypherWindowsStarted, sysErr: d.systemErrorGameOver }; });
    expect(st.savers).toBeLessThan(2); // spent only because the player pressed it
    expect(st.streak).toBe(1);
    expect(st.sysErr).toBe(false);
    expect(st.windows).toBe(10);
  });

  test('negative control: first-fault window (N01, "small glitch") is not a system error', async ({ page }) => {
    await boot(page, 4);
    const s = await firstPatternThenNextInput(page, 5);
    expect(s.over).toBe(false);
    expect(s.sysErr).toBe(false);
    expect(s.len).toBe(2);
    expect(s.savers).toBe(2);
  });

  test('negative control: last-check window (N06/N07) is not a system error', async ({ page }) => {
    await boot(page, 13);
    const s = await firstPatternThenNextInput(page, 14);
    expect(s.over).toBe(false);
    expect(s.sysErr).toBe(false);
    expect(s.len).toBe(2);
  });

  test('negative control: a Cypher window (your-machine) is not a system error', async ({ page }) => {
    await boot(page, 6);
    const s = await firstPatternThenNextInput(page, 7);
    expect(s.over).toBe(false);
    expect(s.sysErr).toBe(false);
    expect(s.len).toBe(2);
  });
});
