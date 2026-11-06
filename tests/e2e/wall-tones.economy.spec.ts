import { expect, test, type Page } from '@playwright/test';

/**
 * Economy E2E for Wall Tones (backlog 12/12a/18/19): gold Bars accrual and
 * persistence, the store's hint unlocks, the Your Turn hint gating, and
 * achievements. Driven through the window.__wallTonesDebug bridge like the
 * desktop spec; speech fetches are aborted so lines settle instantly, but
 * the request log still proves which clips the game tried to play.
 */

interface DebugSnap {
  phase: string;
  sequence: number[];
  inputStep: number;
  streak: number;
  bestStreak: number;
  bars: number;
  barsTotal: number;
  hintLevel: number;
  hintRevealCount: number;
  unlockedAchievements: string[];
  storeOpen: boolean;
  sequenceRowVisible: boolean;
  sequenceBoxesShown: number;
  flatAwaitingStart: boolean;
}

const readState = (page: Page): Promise<DebugSnap> =>
  page.evaluate(() => {
    const d = (window as unknown as { __wallTonesDebug: DebugSnap })
      .__wallTonesDebug;
    return {
      phase: d.phase,
      sequence: [...d.sequence],
      inputStep: d.inputStep,
      streak: d.streak,
      bestStreak: d.bestStreak,
      bars: d.bars,
      barsTotal: d.barsTotal,
      hintLevel: d.hintLevel,
      hintRevealCount: d.hintRevealCount,
      unlockedAchievements: [...d.unlockedAchievements],
      storeOpen: d.storeOpen,
      sequenceRowVisible: d.sequenceRowVisible,
      sequenceBoxesShown: d.sequenceBoxesShown,
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

const dbg = (page: Page, call: string): Promise<unknown> =>
  page.evaluate(
    (c) =>
      (window as unknown as {
        __wallTonesDebug: Record<string, (n?: number) => unknown>;
      }).__wallTonesDebug[c]!(),
    call,
  );
const grantBars = (page: Page, amount: number): Promise<unknown> =>
  page.evaluate(
    (n) =>
      (window as unknown as {
        __wallTonesDebug: { grantBars(a: number): void };
      }).__wallTonesDebug.grantBars(n),
    amount,
  );

/** Fail every clip fast; page.on('request') still records the attempt. */
async function abortSpeech(page: Page, requests: string[]): Promise<void> {
  page.on('request', (request) => {
    if (request.url().includes('/audio/speech/')) {
      requests.push(request.url());
    }
  });
  await page.route('**/audio/speech/**', (route) => route.abort());
}

async function bootWallTones(page: Page, fresh: boolean): Promise<void> {
  if (!fresh) {
    // sessionStorage survives same-tab navigation; the init script below
    // clears localStorage only while this marker is absent.
    await page.evaluate(() =>
      window.sessionStorage.setItem('wt-keep-storage', '1'),
    );
  }
  await page.addInitScript(() => {
    window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    if (!window.sessionStorage.getItem('wt-keep-storage')) {
      window.localStorage.clear();
    }
  });
  await page.goto('/');
  await page.waitForFunction(
    () =>
      Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
    undefined,
    { timeout: 60_000 },
  );
  await expect
    .poll(async () => (await readState(page)).flatAwaitingStart, {
      timeout: 60_000,
    })
    .toBe(true);
}

/** Play correct rounds until the streak reaches target (desktop.spec pattern). */
async function playToStreak(page: Page, target: number): Promise<void> {
  for (let round = 0; round < target; round += 1) {
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');
    const snap = await readState(page);
    await submitPad(page, snap.sequence[snap.inputStep]!);
    if (snap.inputStep + 1 < snap.sequence.length) {
      round -= 1; // multi-note round: keep stepping through the pattern
    }
  }
}

test.describe('Wall Tones economy: Bars, store, hints, achievements', () => {
  test('completing a pattern awards Bars, persists them and the best streak across reloads, and speaks the first-Bars line once', async ({
    page,
  }) => {
    test.slow();
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);
    await submitPad(page, 0); // start tap
    await playToStreak(page, 1);

    await expect.poll(async () => (await readState(page)).bars).toBe(1);
    let snap = await readState(page);
    expect(snap.bestStreak).toBe(1);
    expect(snap.unlockedAchievements).toContain('first-pattern');
    // The line sits behind the between-rounds delay in the speech chain.
    // Each line fires up to two requests (decode fetch + HTMLAudio fallback).
    await expect
      .poll(
        () =>
          speechRequests.filter((u) => u.includes('bars-first-earn.mp3')).length,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0); // first-time voice fired

    // Reload WITHOUT clearing storage: balance and best streak survive.
    await bootWallTones(page, false);
    snap = await readState(page);
    expect(snap.bars).toBe(1);
    expect(snap.bestStreak).toBe(1);

    // A later completion does not replay the first-Bars line.
    speechRequests.length = 0;
    await submitPad(page, 0);
    await playToStreak(page, 1);
    await expect.poll(async () => (await readState(page)).bars).toBe(2);
    await page.waitForTimeout(3_000); // let the speech chain finish
    expect(
      speechRequests.filter((u) => u.includes('bars-first-earn.mp3')).length,
    ).toBe(0);
  });

  test('the Your Turn pattern row stays hidden until a hint is bought, then shows the purchased prefix', async ({
    page,
  }) => {
    test.slow();
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);
    await submitPad(page, 0);
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');

    // No hint owned: the row stays hidden even though it is Your Turn.
    await expect
      .poll(async () => {
        const d = await readState(page);
        return `${d.sequenceRowVisible}:${d.sequenceBoxesShown}`;
      })
      .toBe('false:0');

    // Buy level 1 and start a fresh round: exactly 5 boxes show.
    await grantBars(page, 50);
    await dbg(page, 'toggleStore');
    expect((await readState(page)).storeOpen).toBe(true);
    await dbg(page, 'buyHint');
    let snap = await readState(page);
    expect(snap.hintLevel).toBe(1);
    expect(snap.bars).toBe(40);
    expect(snap.hintRevealCount).toBe(5);
    expect(snap.unlockedAchievements).toContain('first-purchase');

    // First store visit speaks welcome + hints tour (each line fires up to
    // two requests: decode fetch + HTMLAudio fallback).
    expect(
      speechRequests.filter((u) => u.includes('store-welcome.mp3')).length,
    ).toBeGreaterThan(0);
    expect(
      speechRequests.filter((u) => u.includes('store-hints.mp3')).length,
    ).toBeGreaterThan(0);

  });

  test('a level-1 hint reveals exactly 5 boxes of a 6-note pattern', async ({
    page,
  }) => {
    test.slow();
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);
    await grantBars(page, 50);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyHint');
    await submitPad(page, 0);

    // Play to a 6-note round: the row shows exactly the 5 hinted boxes.
    await playToStreak(page, 5);
    await expect
      .poll(async () => {
        const snap2 = await readState(page);
        if (snap2.phase !== 'input' || snap2.sequence.length < 6) return 'waiting';
        return `${snap2.sequenceRowVisible}:${snap2.sequenceBoxesShown}`;
      }, { timeout: 90_000 })
      .toBe('true:5');
  });

  test('buying beyond the balance fails and prices keep rising past level 3', async ({
    page,
  }) => {
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);
    await grantBars(page, 12);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyHint');
    let snap = await readState(page);
    expect(snap.hintLevel).toBe(1); // 12 - 10 = 2 Bars left
    expect(snap.bars).toBe(2);
    await dbg(page, 'buyHint');
    snap = await readState(page);
    expect(snap.hintLevel).toBe(1); // 15 Bars needed, purchase refused
    expect(snap.bars).toBe(2);

    await grantBars(page, 100);
    await dbg(page, 'buyHint');
    await dbg(page, 'buyHint');
    snap = await readState(page);
    expect(snap.hintLevel).toBe(3); // 2 - 15 - 22 + 100 = 65
    expect(snap.bars).toBe(65);
    // No level cap: level 4 costs round(22 * 1.3) = 29 Bars.
    await dbg(page, 'buyHint');
    snap = await readState(page);
    expect(snap.hintLevel).toBe(4);
    expect(snap.bars).toBe(36); // 65 - 29
    expect(snap.hintRevealCount).toBe(20);
  });

  test('streak milestones unlock achievements', async ({ page }) => {
    test.slow();
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);
    await submitPad(page, 0);
    await playToStreak(page, 5);
    const snap = await readState(page);
    expect(snap.bars).toBe(5);
    expect(snap.barsTotal).toBe(5);
    expect(snap.unlockedAchievements).toContain('streak-5');
  });
});
