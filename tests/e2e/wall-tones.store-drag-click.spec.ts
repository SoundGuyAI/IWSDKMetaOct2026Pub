import { expect, test, type Page } from '@playwright/test';

/**
 * Store drag-click guard. pointer-events fires `click` on release for any
 * press under 300 ms, however far the pointer moved, so a quick drag that
 * ends over a tile used to select it (which rebuilds the list and resets
 * its scroll position). A press that strays past the tap slop must not
 * select; a plain click still must.
 */

interface ScrollSnap {
  y: number;
  maxY: number;
  scrollable: boolean;
}

type Dbg = Record<string, unknown>;

const readScroll = (page: Page): Promise<ScrollSnap> =>
  page.evaluate(
    () =>
      (window as unknown as { __wallTonesDebug: { storeScroll: ScrollSnap } })
        .__wallTonesDebug.storeScroll,
  );

const readSelected = (page: Page): Promise<string | null> =>
  page.evaluate(
    () =>
      (window as unknown as { __wallTonesDebug: { storeSelected: string | null } })
        .__wallTonesDebug.storeSelected,
  );

const dbg = (page: Page, call: string): Promise<unknown> =>
  page.evaluate(
    (c) =>
      (window as unknown as { __wallTonesDebug: Record<string, () => unknown> })
        .__wallTonesDebug[c]!(),
    call,
  );

/** Fail every clip fast; the game treats the lines as settled. */
async function abortSpeech(page: Page): Promise<void> {
  await page.route('**/audio/speech/**', (route) => route.abort());
}

async function bootWallTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    window.localStorage.clear();
  });
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as unknown as { __wallTonesDebug?: Dbg }).__wallTonesDebug),
    undefined,
    { timeout: 60_000 },
  );
  // The loading overlay fades out but stays hit-testable until removed.
  await page.waitForFunction(() => document.getElementById('wt-loading') == null, undefined, {
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __wallTonesDebug: { flatAwaitingStart: boolean } })
              .__wallTonesDebug.flatAwaitingStart,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
}

test.describe('Wall Tones store drag does not select the tile it ends on', () => {
  test('a quick press-drag-release on one tile is not a tap; a plain click still selects', async ({
    page,
  }) => {
    await abortSpeech(page);
    await bootWallTones(page);
    await dbg(page, 'toggleStore');
    await expect
      .poll(async () => (await readScroll(page)).maxY, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const targets = (): Promise<Record<string, { x: number; y: number }>> =>
      page.evaluate(
        () =>
          (window as unknown as {
            __wallTonesDebug: { storePointerTargets: Record<string, { x: number; y: number }> };
          }).__wallTonesDebug.storePointerTargets,
      );
    await expect
      .poll(async () => Object.keys(await targets()).some((n) => n.startsWith('store-tile-')))
      .toBe(true);
    const t = await targets();
    const key = Object.keys(t).find((n) => n.startsWith('store-tile-'))!;
    const { x, y } = t[key]!;
    expect(await readSelected(page)).toBeNull();
    // Quick drag that stays on the tile (well past the 14px tap slop).
    await page.mouse.move(x, y - 12);
    await page.mouse.down();
    await page.mouse.move(x, y + 12, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await readSelected(page)).toBeNull();
    // Out and back to the press point (max excursion, not end distance).
    await page.mouse.move(x, y - 10);
    await page.mouse.down();
    await page.mouse.move(x, y + 14, { steps: 4 });
    await page.mouse.move(x, y - 10, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await readSelected(page)).toBeNull();
    // A plain click still selects.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => readSelected(page)).not.toBeNull();
  });
});
