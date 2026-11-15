import { expect, test, type Page } from '@playwright/test';
import { WallTonesSequence } from '../../src/wall-tones/sequence.js';

function completeRounds(game: WallTonesSequence, count: number): void {
  for (let round = 0; round < count; round += 1) {
    const length = game.sequence.length;
    for (let note = 0; note < length; note += 1) game.onCorrectInput();
  }
}

test('run improvement tracks best-score accounting independently of failure speech', () => {
  const game = new WallTonesSequence();
  game.startNewRun();
  expect(game.runImprovedBest).toBe(false); // immediate miss
  completeRounds(game, 3);
  expect(game.streak).toBe(3);
  expect(game.bestStreak).toBe(3);
  expect(game.runImprovedBest).toBe(true); // first personal best
  game.onWrongInput();
  expect(game.runImprovedBest).toBe(false);
  completeRounds(game, 2);
  expect(game.runImprovedBest).toBe(false); // below best
  game.onWrongInput();
  completeRounds(game, 3);
  expect(game.runImprovedBest).toBe(false); // tied best is not improvement
  completeRounds(game, 1);
  expect(game.streak).toBe(4);
  expect(game.bestStreak).toBe(4);
  expect(game.runImprovedBest).toBe(true); // best already updated, baseline retained
  game.onWrongInput();
  completeRounds(game, 1);
  expect(game.runImprovedBest).toBe(false);
  game.resetAllScores();
  game.startNewRun();
  completeRounds(game, 1);
  expect(game.runImprovedBest).toBe(true); // fresh session resets baseline too
});


/** Exercise the real failure path. Failed clip fetches keep speech fast while
 * their URLs still prove which existing recording was selected. */
async function bootFeedbackGame(page: Page, subtitles: boolean): Promise<string[]> {
  const clips: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/audio/speech/')) clips.push(request.url());
  });
  await page.route('**/audio/speech/**', route => route.abort());
  await page.addInitScript((showSubtitles) => {
    localStorage.clear();
    localStorage.setItem('wall-tones-hearing-subtitles', String(showSubtitles));
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
  }, subtitles);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__wallTonesDebug?.flatAwaitingStart)), { timeout: 60000 }).toBe(true);
  await page.evaluate(() => (window as any).__wallTonesDebug.submitPad(0));
  await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.phase), { timeout: 60000 }).toBe('input');
  return clips;
}

for (const improvedBest of [false, true]) {
  test(`miss feedback and failure-only speech after ${improvedBest ? 'a new best' : 'an immediate miss'}`, async ({ page }, testInfo) => {
    const clips = await bootFeedbackGame(page, improvedBest);
    if (improvedBest) {
      await page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        d.submitPad(d.sequence[0]);
      });
      await expect.poll(() => page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        return d.phase === 'input' && d.sequence.length === 2;
      }), { timeout: 60000 }).toBe(true);
      expect(await page.evaluate(() => (window as any).__wallTonesDebug.bestStreak)).toBe(1);
      // Hit the first note of the longer pattern so the miss has a leading
      // note and the preceding-squares row is exercised (owner 2026-11-15).
      await page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        d.submitPad(d.sequence[0]);
      });
      await expect.poll(() => page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        return d.phase === 'input' && d.inputStep === 1;
      }), { timeout: 60000 }).toBe(true);
    }
    const mismatch = await page.evaluate(() => {
      const d = (window as any).__wallTonesDebug;
      const expected = d.sequence[d.inputStep];
      return { expected, hit: (expected + 1) % 4, inputStep: d.inputStep, sequence: [...d.sequence] };
    });
    const names = ['green', 'red', 'blue', 'yellow'];
    // Owner 2026-11-15: squares instead of words; two comparison rows (Expected
    // vs Hit) of up to 5 notes, the final position differing - e.g. right RRRBG
    // vs played RRRBY.
    const expectedPreceding = mismatch.sequence.slice(Math.max(0, mismatch.inputStep - 4), mismatch.inputStep);
    const beforeFailure = clips.length;
    await page.evaluate(hit => (window as any).__wallTonesDebug.submitPad(hit), mismatch.hit);
    await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.wrongHitRowVisible)).toBe(true);
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitPreceding)).toEqual(expectedPreceding);
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitExpected)).toBe(mismatch.expected);
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitHit)).toBe(mismatch.hit);
    const statusLine = await page.evaluate(() => (window as any).__wallTonesDebug.statusLineText);
    expect(statusLine).not.toContain(names[mismatch.expected]);
    expect(statusLine).not.toContain(names[mismatch.hit]);
    // No Store purchase is needed, and the optional full-pattern reveal is not added.
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.sequenceRowVisible)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`missed-hit-line-${improvedBest ? 'best' : 'first'}.png`) });
    await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.gameOverOpen), { timeout: 30000 }).toBe(true);
    expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitRowVisible)).toBe(true);
    // Owner 2026-11-15: in Game Over the Hit row sits on its own line below
    // the Expected row.
    const rowTops = await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitPopupRowTops);
    expect(rowTops).not.toBeNull();
    expect(rowTops.hitTop).toBeGreaterThan(rowTops.expectedTop);
    const failureClips = clips.slice(beforeFailure);
    expect(failureClips.some(url => /\/wrong-[1-5]\.mp3/.test(url))).toBe(true);
    expect(failureClips.some(url => /\/(cheer|new-best|milestone)/.test(url))).toBe(false);
    if (improvedBest) {
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit]')).toHaveCount((expectedPreceding.length + 1) * 2);
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Expected:');
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Hit:');
      // Two comparison rows, each with its lead-in plus the differing final
      // note (owner 2026-11-15: right pattern vs what was played).
      for (const rowName of ['expected', 'hit']) {
        const row = page.locator(`#wall-tones-flat-subtitles [data-wronghit-row="${rowName}"]`);
        await expect(row).toHaveCount(1);
        await expect(row.locator('[data-wronghit]')).toHaveCount(expectedPreceding.length + 1);
      }
      // The user's exact example (owner 2026-11-15): right RRRBG, played RRRBY
      // - injected, since replaying that exact pattern is disproportionate.
      await page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        d.debugSetWrongHit({ hit: 3, expected: 0, preceding: [1, 1, 1, 2], truncated: false });
      });
      const rowLabels = (rowName: string) =>
        page.locator(`#wall-tones-flat-subtitles [data-wronghit-row="${rowName}"] [data-wronghit]`).evaluateAll(
          squares => squares.map(square => square.getAttribute('aria-label')),
        );
      await expect.poll(() => rowLabels('expected')).toEqual(['red', 'red', 'red', 'blue', 'green']);
      await expect.poll(() => rowLabels('hit')).toEqual(['red', 'red', 'red', 'blue', 'yellow']);
      // No ellipsis when no earlier notes are hidden.
      await expect(page.locator('#wall-tones-flat-subtitles')).not.toContainText('…');
      expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitTruncated)).toBe(false);
      // Truncated rendering, injected: the rows read the same captured-miss
      // state. Owner 2026-11-15: a leading "…" marks hidden earlier notes
      // (the 5 vs 10 window and its exact prefix policy are still open).
      await page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        d.debugSetWrongHit({ hit: d.wrongHitHit, expected: d.wrongHitExpected, preceding: [0, 1, 2, 3], truncated: true });
      });
      await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.wrongHitTruncated)).toBe(true);
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('…');
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit]')).toHaveCount(10);
      await page.evaluate((preceding) => {
        const d = (window as any).__wallTonesDebug;
        d.debugSetWrongHit({ hit: d.wrongHitHit, expected: d.wrongHitExpected, preceding, truncated: false });
      }, expectedPreceding);
      await expect(page.locator('#wall-tones-flat-subtitles')).not.toContainText('…');
    }
    await page.screenshot({ path: testInfo.outputPath(`missed-hit-${improvedBest ? 'best' : 'first'}.png`) });
    await page.evaluate((retry) => {
      const d = (window as any).__wallTonesDebug;
      if (retry) { d.grantSavers(1); d.gameOverUseSaver(); }
      else d.gameOverNewRun();
    }, improvedBest);
    await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.wrongHitRowVisible)).toBe(false);
  });
}
