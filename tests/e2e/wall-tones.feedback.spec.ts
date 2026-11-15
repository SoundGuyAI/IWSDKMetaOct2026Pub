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
    // Owner 2026-11-15: squares instead of words, plus up to the last 10 notes
    // leading up to the miss, then Expected:/Hit: with their squares.
    const expectedPreceding = mismatch.sequence.slice(Math.max(0, mismatch.inputStep - 10), mismatch.inputStep);
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
    const failureClips = clips.slice(beforeFailure);
    expect(failureClips.some(url => /\/wrong-[1-5]\.mp3/.test(url))).toBe(true);
    expect(failureClips.some(url => /\/(cheer|new-best|milestone)/.test(url))).toBe(false);
    if (improvedBest) {
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit]')).toHaveCount(expectedPreceding.length + 2);
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Expected:');
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Hit:');
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
