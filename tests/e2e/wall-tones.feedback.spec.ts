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

/** The complete Game Over wrong-hit layout ordering predicate: Hit row
 * strictly below the Expected row, left edges aligned within 1px. False
 * while the popup is display:none and its Yoga nodes have no computed
 * layout, so polling it also waits out the post-open layout pass. */
async function popupRowOrderingValid(page: Page): Promise<boolean> {
  const tops = await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitPopupRowTops);
  return (
    tops != null &&
    tops.hitTop > tops.expectedTop &&
    Math.abs(tops.hitLeft - tops.expectedLeft) <= 1
  );
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
    // Owner 2026-11-15 18:35: one compact row - Expected and Hit side by
    // side, each with up to 5 notes, the final position differing (right
    // RRRBG vs played RRRBY); the pattern/history row no longer shows after
    // a failure so the panel stays small on a phone.
    const expectedPreceding = mismatch.sequence.slice(Math.max(0, mismatch.inputStep - 10), mismatch.inputStep);
    const expectedLeadIn = expectedPreceding.slice(-4);
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
    // Owner 2026-11-15 19:01: in Game Over the Hit row sits on its own line
    // below the Expected row, both sharing a left edge. The popup leaves
    // display:none in the same call stack that sets gameOverOpen, and Yoga
    // lays the row out on the next frame, so the layout-dependent read must
    // poll the complete ordering predicate rather than read once (main CI
    // run 1171: both tops read 0 on a loaded runner, failing the assertion).
    await expect.poll(() => popupRowOrderingValid(page), { timeout: 10000 }).toBe(true);
    const rowTops = await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitPopupRowTops);
    expect(rowTops).not.toBeNull();
    expect(rowTops.hitTop).toBeGreaterThan(rowTops.expectedTop);
    expect(Math.abs(rowTops.hitLeft - rowTops.expectedLeft)).toBeLessThanOrEqual(1);
    const failureClips = clips.slice(beforeFailure);
    expect(failureClips.some(url => /\/wrong-[1-5]\.mp3/.test(url))).toBe(true);
    expect(failureClips.some(url => /\/(cheer|new-best|milestone)/.test(url))).toBe(false);
    if (improvedBest) {
      // Two comparison lines - Expected above Hit, each with its lead-in plus
      // the differing final note (owner 2026-11-15 19:01). No history/pattern
      // row after a failure.
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit]')).toHaveCount((expectedLeadIn.length + 1) * 2);
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Expected:');
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('Hit:');
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit-row="history"]')).toHaveCount(0);
      for (const rowName of ['expected', 'hit']) {
        const row = page.locator(`#wall-tones-flat-subtitles [data-wronghit-row="${rowName}"]`);
        await expect(row).toHaveCount(1);
        await expect(row.locator('[data-wronghit]')).toHaveCount(expectedLeadIn.length + 1);
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
      // No ellipsis: the four-note lead-in leaves nothing hidden, so the
      // rows carry no "..." prefix (owner 2026-11-15 23:23).
      await expect(page.locator('#wall-tones-flat-subtitles')).not.toContainText('...');
      expect(await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitTruncated)).toBe(false);
      // Longer captured chains render the same two comparison lines, now
      // with a leading "..." on each row to mark the hidden tail (owner
      // 2026-11-15 23:23) - still no history row.
      await page.evaluate(() => {
        const d = (window as any).__wallTonesDebug;
        d.debugSetWrongHit({ hit: d.wrongHitHit, expected: d.wrongHitExpected, preceding: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1], truncated: true });
      });
      await expect.poll(() => page.evaluate(() => (window as any).__wallTonesDebug.wrongHitTruncated)).toBe(true);
      await expect(page.locator('#wall-tones-flat-subtitles')).toContainText('...');
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit-tail]')).toHaveCount(2);
      await expect(page.locator('#wall-tones-flat-subtitles [data-wronghit]')).toHaveCount(5 * 2);
      await page.evaluate((preceding) => {
        const d = (window as any).__wallTonesDebug;
        d.debugSetWrongHit({ hit: d.wrongHitHit, expected: d.wrongHitExpected, preceding, truncated: false });
      }, expectedPreceding);
      await expect(page.locator('#wall-tones-flat-subtitles')).not.toContainText('...');
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

test('game-over wrong-hit ordering predicate rejects while the popup layout is invalid', async ({ page }) => {
  await bootFeedbackGame(page, false);
  // Inject a miss without replaying rounds; the Game Over popup stays closed.
  await page.evaluate(() => {
    (window as any).__wallTonesDebug.debugSetWrongHit({ hit: 1, expected: 0, preceding: [], truncated: false });
  });
  // The popup row sits inside the still-hidden Game Over popup, so its Yoga
  // nodes have no computed layout: the ordering predicate must be false and
  // stay false - a bounded poll rejects rather than passing vacuously.
  const raw = await page.evaluate(() => (window as any).__wallTonesDebug.wrongHitPopupRowTops);
  expect(raw == null || raw.hitTop <= raw.expectedTop || Math.abs(raw.hitLeft - raw.expectedLeft) > 1).toBe(true);
  await expect(
    expect.poll(() => popupRowOrderingValid(page), { timeout: 1000 }).toBe(true),
  ).rejects.toThrow();
});
