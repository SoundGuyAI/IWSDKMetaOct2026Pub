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
  playLevel: number;
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
      playLevel: d.playLevel,
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

const grantPlayLevel = (page: Page, level: number): Promise<unknown> =>
  page.evaluate(
    (n) =>
      (window as unknown as {
        __wallTonesDebug: { grantPlayLevel(l: number): void };
      }).__wallTonesDebug.grantPlayLevel(n),
    level,
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

  test('Autoplay unlocks at Play L4 (after Hint L4) and plays the pattern prefix, capped one short', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    // Listen 30 + Hint 25+50+100+200 + Autoplay L1 250 = 655.
    await grantBars(page, 660);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyListen');
    await dbg(page, 'buyAutoplay');
    expect((await readState(page)).autoplayLevel).toBe(0); // gate: Hint L4 first
    for (let i = 0; i < 4; i += 1) {
      await dbg(page, 'buyHint');
    }
    // Gate chain (owner voice 2026-11-13): Hint L4 unlocks Play L1, and
    // only Play L4 unlocks Autoplay - Hint L4 alone is no longer enough.
    await dbg(page, 'buyAutoplay');
    expect((await readState(page)).autoplayLevel).toBe(0);
    await grantPlayLevel(page, 4);
    await dbg(page, 'buyAutoplay');
    let snap = await readState(page);
    expect(snap.hintLevel).toBe(4);
    expect(snap.playLevel).toBe(4);
    expect(snap.autoplayLevel).toBe(1);
    expect(snap.bars).toBe(5);

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
    const read = (): Promise<{ savers: number; bars: number; demoBoost: number }> =>
      page.evaluate(() => {
        const d = (window as unknown as {
          __wallTonesDebug: { savers: number; bars: number; demoBoost: number };
        }).__wallTonesDebug;
        return { savers: d.savers, bars: d.bars, demoBoost: d.demoBoost };
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

  test('Saver: ?demoBars covers the Store Buy the same way as Listen/Replay', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    // 18 demo Bars exactly covers one Saver; persisted balance stays 0.
    await bootWallTones(page, true, '?demoBars=18');
    await dbg(page, 'toggleStore');
    await dbg(page, 'buySaver');
    const snap = await page.evaluate(() => {
      const d = (window as unknown as {
        __wallTonesDebug: { savers: number; bars: number; demoBoost: number };
      }).__wallTonesDebug;
      return { savers: d.savers, bars: d.bars, demoBoost: d.demoBoost };
    });
    expect(snap.savers).toBe(1);
    expect(snap.demoBoost).toBe(0);
    expect(snap.bars).toBe(0);
  });
  test('Play: Buy is denied while locked and the greyed control button opens the Store at the Play tile', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true, '?demoBars=800');
    await dbg(page, 'toggleStore');
    // Locked (Hint L4 not reached): Buy is refused, no Bars move.
    await dbg(page, 'buyPlay');
    expect((await readState(page)).playLevel).toBe(0);
    // The greyed control-row Play button is a Store shortcut to its tile.
    await dbg(page, 'pressPlay');
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__wallTonesDebug.storeSelected,
        ),
      )
      .toBe('play');
    expect((await readState(page)).storeOpen).toBe(true);
  });

  test('Play: enters the next 5 x level tones, once per pattern, may enter the final note', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true);
    await grantPlayLevel(page, 1);
    expect((await readState(page)).playLevel).toBe(1);
    await submitPad(page, 0); // start tap
    // Round 1 is a single note: Play enters it and the round completes.
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 90_000 })
      .toBe('input');
    await dbg(page, 'pressPlay');
    await expect
      .poll(async () => (await readState(page)).streak, { timeout: 90_000 })
      .toBe(1);

    // Reach the 6-note round manually.
    await playToStreak(page, 5);
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
      .toBe('input:0');
    // Play enters 5 tones from the current position, one short of the end.
    await dbg(page, 'pressPlay');
    await expect
      .poll(
        async () => {
          const s = await readState(page);
          return s.phase === 'input' ? `input:${s.inputStep}` : s.phase;
        },
        { timeout: 90_000 },
      )
      .toBe('input:5');
    // Once per pattern: a second press in the same round is refused.
    await dbg(page, 'pressPlay');
    await page.waitForTimeout(1500);
    let snap = await readState(page);
    expect(snap.phase).toBe('input');
    expect(snap.inputStep).toBe(5);
    // The final note is still playable by hand afterwards.
    await submitPad(page, snap.sequence[snap.inputStep]!);
    await expect
      .poll(async () => (await readState(page)).streak, { timeout: 90_000 })
      .toBe(6);

  });

  test('Index: tile sits beside Play, Buy refused while locked, debug grant owns it', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page, true, '?demoBars=800');
    await dbg(page, 'toggleStore');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__wallTonesDebug.storePointerTargets[
                'store-tile-index'
              ]?.x,
          ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__wallTonesDebug.storePointerTargets[
                'store-tile-play'
              ]?.x,
          ),
      )
      .toBeGreaterThan(0);
    // Gated behind Hint level 3: the Buy is refused while locked.
    await dbg(page, 'buyIndex');
    expect(
      await page.evaluate(
        () => (window as any).__wallTonesDebug.ownsIndex,
      ),
    ).toBe(false);
    await dbg(page, 'grantIndex');
    expect(
      await page.evaluate(
        () => (window as any).__wallTonesDebug.ownsIndex,
      ),
    ).toBe(true);
  });
});


test('store empty space clears selection without buying or closing; tiles and Buy stay usable', async ({ page }, testInfo) => {
  await abortSpeech(page);
  await bootWallTones(page, true, '?demoBars=800');
  await dbg(page, 'toggleStore');
  const selected = () => page.evaluate(() => (window as any).__wallTonesDebug.storeSelected);
  const targets = () => page.evaluate(() => (window as any).__wallTonesDebug.storePointerTargets);
  const click = async (x: number, y: number) => {
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(800);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(600); // allow rebuilt UIKit layout/world matrices to settle
  };
  await expect.poll(async () => (await targets())['store-tile-replay']?.x).toBeGreaterThan(0);
  const replay = (await targets())['store-tile-replay'];
  await click(replay.x, replay.y);
  await expect.poll(selected).toBe('replay');
  await testInfo.attach('selected', { body: await page.screenshot(), contentType: 'image/png' });
  const before = await readState(page);
  // Empty margin beside the centered top row, inside the fixed Store popup.
  await click(replay.x - 90, replay.y);
  await expect.poll(selected).toBe(null);
  expect((await readState(page)).storeOpen).toBe(true);
  expect((await readState(page)).bars).toBe(before.bars);
  expect((await readState(page)).replaysTotal).toBe(before.replaysTotal);
  await testInfo.attach('deselected', { body: await page.screenshot(), contentType: 'image/png' });
  await click(replay.x, replay.y);
  await expect.poll(selected).toBe('replay');
  const buy = (await targets())['store-buy'];
  await click(buy.x, buy.y);
  await expect.poll(async () => (await readState(page)).replaysPaid).toBe(1);
  expect(await selected()).toBe('replay');
  expect((await readState(page)).bars).toBe(before.bars - 20);
  // Existing tap-the-selected-tile toggle remains intact.
  await click(replay.x, replay.y);
  await expect.poll(selected).toBe(null);
});
