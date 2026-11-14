import { expect, test, type Page } from '@playwright/test';

/**
 * Store drag scrolling through the touch/XR pointer path (not the mouse,
 * which uikit only lets drag the scrollbar).
 *
 * Bug: XR pointers reuse ONE native-event object for every move of every
 * drag (iwsdk multi-pointer). uikit stamps a "was scrolled" flag on it and
 * zeroes later deltas while it is set, so the first drag moved a few px then
 * stalled and later drags did not move at all. The Store list now clears that
 * flag on every scroll step (storeListOnScroll). The browser cannot reuse the
 * native event, so shareWasScrolledFlag makes the flag shared across events.
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

test.use({ hasTouch: true });

async function shareWasScrolledFlag(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const realSymbol = window.Symbol;
    let flagSym: symbol | undefined;
    let shared: unknown;
    const wrapped = function (d?: string) {
      const sym = realSymbol(d);
      if (d === 'was-scrolled') {
        flagSym = sym;
        Object.defineProperty(Event.prototype, sym, {
          configurable: true,
          get: () => shared,
          set: (v: unknown) => {
            shared = v;
          },
        });
      }
      return sym;
    } as unknown as SymbolConstructor;
    Object.setPrototypeOf(wrapped, realSymbol);
    for (const k of Object.getOwnPropertyNames(realSymbol)) {
      if (k === 'length' || k === 'name' || k === 'prototype') continue;
      (wrapped as unknown as Record<string, unknown>)[k] = (
        realSymbol as unknown as Record<string, unknown>
      )[k];
    }
    wrapped.prototype = realSymbol.prototype;
    window.Symbol = wrapped;
    // Real XR native events carry the flag as an OWN symbol property; show it
    // as one so code that clears it by looking it up behaves the same here.
    const realOwn = Object.getOwnPropertySymbols;
    Object.getOwnPropertySymbols = (o: object) =>
      o instanceof Event && flagSym != null ? [...realOwn(o), flagSym] : realOwn(o);
  });
}

async function touchDrag(
  page: Page,
  x: number,
  y0: number,
  y1: number,
  steps = 12,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, ys: number | null) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: ys == null ? [] : [{ x, y: ys, id: 1 }],
    });
  await send('touchStart', y0);
  for (let i = 1; i <= steps; i++) {
    await send('touchMove', y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', null);
  await page.waitForTimeout(700);
  await cdp.detach();
}

test.describe('Wall Tones store touch/XR-style drag scrolls repeatedly', () => {
  test('two successive drags both travel, and neither selects a tile', async ({ page }) => {
    await shareWasScrolledFlag(page);
    await abortSpeech(page);
    await bootWallTones(page);
    await dbg(page, 'toggleStore');
    await expect
      .poll(async () => (await readScroll(page)).maxY, { timeout: 30_000 })
      .toBeGreaterThan(100);
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
    const y0 = (await readScroll(page)).y;
    await touchDrag(page, x, y + 20, y - 40);
    const y1 = (await readScroll(page)).y;
    expect(y1 - y0).toBeGreaterThan(20);
    expect(await readSelected(page)).toBeNull();
    // Second drag, same direction again, and a third back down.
    await touchDrag(page, x, y + 20, y - 40);
    const y2 = (await readScroll(page)).y;
    expect(y2 - y1).toBeGreaterThan((y1 - y0) * 0.5);
    expect(await readSelected(page)).toBeNull();
    await touchDrag(page, x, y - 40, y + 20);
    const y3 = (await readScroll(page)).y;
    expect(y2 - y3).toBeGreaterThan(20);
    expect(await readSelected(page)).toBeNull();
  });
});
