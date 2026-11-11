import { expect, test, type Page } from '@playwright/test';

/**
 * Skill-tree store E2E (backlog 44, owner decisions 2026-11-11): the Listen
 * item gates the Listen-phase pattern row and unlocks Hint L1, Autoplay
 * unlocks at Hint L4 and plays the pattern prefix for the player, and the
 * Replay consumable is earned past the Hint coverage and spent by the Repeat
 * button. Driven through the window.__wallTonesDebug bridge like the economy
 * spec; speech fetches are aborted so lines settle instantly.
 */

interface DebugSnap {
  phase: string;
  sequence: number[];
  inputStep: number;
  streak: number;
  bars: number;
  hintLevel: number;
  ownsListen: boolean;
  autoplayLevel: number;
  replaysFree: number;
  replaysPaid: number;
  replaysTotal: number;
  demoBoost: number;
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
      bars: d.bars,
      hintLevel: d.hintLevel,
      ownsListen: d.ownsListen,
      autoplayLevel: d.autoplayLevel,
      replaysFree: d.replaysFree,
      replaysPaid: d.replaysPaid,
      replaysTotal: d.replaysTotal,
      demoBoost: d.demoBoost,
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

/** Fail every clip fast; the game treats the lines as settled. */
async function abortSpeech(page: Page): Promise<void> {
  await page.route('**/audio/speech/**', (route) => route.abort());
}

async function bootWallTones(
  page: Page,
  fresh: boolean,
  query = '',
): Promise<void> {
  if (!fresh) {
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
  await page.goto(`/${query}`);
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

/** Play correct rounds until the streak reaches target (economy spec pattern). */
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

test.describe('Wall Tones store skill tree', () => {
  test('without Listen the Listen-phase row stays hidden; owning Listen reveals it', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    await submitPad(page, 0); // start tap
    // Catch the first Listen playback: no Listen item, no listen line.
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('playback');
    expect((await readState(page)).sequenceRowVisible).toBe(false);
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');

    // Buy Listen and complete the round: the next Listen playback shows the row.
    await grantBars(page, 30);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyListen');
    expect((await readState(page)).ownsListen).toBe(true);
    await playToStreak(page, 1);
    await expect
      .poll(
        async () => {
          const snap = await readState(page);
          return snap.phase === 'playback' && snap.sequenceRowVisible
            ? 'shown'
            : snap.phase;
        },
        { timeout: 90_000 },
      )
      .toBe('shown');
  });

  test('Autoplay unlocks at Hint L4 and plays the pattern prefix, capped one short', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    // Listen 30 + Hint 25+50+100+200 + Autoplay L1 12 = 417.
    await grantBars(page, 420);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyListen');
    await dbg(page, 'buyAutoplay');
    expect((await readState(page)).autoplayLevel).toBe(0); // gate: Hint L4 first
    for (let i = 0; i < 4; i += 1) {
      await dbg(page, 'buyHint');
    }
    await dbg(page, 'buyAutoplay');
    let snap = await readState(page);
    expect(snap.hintLevel).toBe(4);
    expect(snap.autoplayLevel).toBe(1);
    expect(snap.bars).toBe(3);

    await submitPad(page, 0); // start tap
    await playToStreak(page, 5);
    // The 6-note round: Listen plays, then Autoplay plays notes 1-5, so Your
    // Turn starts expecting note 6 (inputStep 5).
    await expect
      .poll(
        async () => {
          const s = await readState(page);
          return s.phase === 'input' && s.sequence.length >= 6
            ? `input:${s.inputStep}`
            : `${s.phase}:${s.inputStep}`;
        },
        { timeout: 120_000 },
      )
      .toBe('input:5');
    // The player finishes the round with the one manual note.
    snap = await readState(page);
    await submitPad(page, snap.sequence[snap.inputStep]!);
    await expect
      .poll(async () => (await readState(page)).streak, { timeout: 90_000 })
      .toBe(6);
  });

  test('Replay: buy for 20 Bars, Repeat spends it, free earn at the 5-note milestone', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    await grantBars(page, 20);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyReplay');
    let snap = await readState(page);
    expect(snap.replaysPaid).toBe(1);
    expect(snap.bars).toBe(0);

    await submitPad(page, 0); // start tap
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');
    // Repeat spends the paid Replay and re-plays the pattern.
    await dbg(page, 'repeatPattern');
    snap = await readState(page);
    expect(snap.replaysTotal).toBe(0);
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');
    // Empty inventory: Repeat refuses and no replay starts.
    await dbg(page, 'repeatPattern');
    snap = await readState(page);
    expect(snap.replaysTotal).toBe(0);
    expect(snap.phase).toBe('input');

    // Completing the 5-note pattern hits the first earn milestone (no Hint
    // owned: coverage 0): +1 free Replay, kept in inventory.
    await playToStreak(page, 5);
    await expect
      .poll(async () => (await readState(page)).replaysFree, { timeout: 90_000 })
      .toBe(1);
  });

  test('?demoBars=100 grants spendable test Bars in memory only', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true, '?demoBars=100');
    let snap = await readState(page);
    expect(snap.demoBoost).toBe(100);
    expect(snap.bars).toBe(100);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyListen'); // 30 test Bars
    snap = await readState(page);
    expect(snap.bars).toBe(70);
    expect(snap.ownsListen).toBe(true);
    // Reload without the flag: the boost is gone and the real balance was
    // never touched (the Listen purchase itself persists).
    await bootWallTones(page, false);
    snap = await readState(page);
    expect(snap.demoBoost).toBe(0);
    expect(snap.bars).toBe(0);
    expect(snap.ownsListen).toBe(true);
  });

  test('Saver: store tile buys into the shared Game Over inventory at 18 Bars', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    await grantBars(page, 18);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buySaver');
    const read = (): Promise<{ savers: number; bars: number }> =>
      page.evaluate(() => {
        const d = (window as unknown as {
          __wallTonesDebug: { savers: number; bars: number };
        }).__wallTonesDebug;
        return { savers: d.savers, bars: d.bars };
      });
    let snap = await read();
    expect(snap.savers).toBe(1);
    expect(snap.bars).toBe(0);
    // No unlock prerequisites, but the wallet still gates the purchase.
    await dbg(page, 'buySaver');
    snap = await read();
    expect(snap.savers).toBe(1);
    // The store stock is the same inventory the Game Over popup reads.
    await bootWallTones(page, false);
    snap = await read();
    expect(snap.savers).toBe(1);
  });
});
