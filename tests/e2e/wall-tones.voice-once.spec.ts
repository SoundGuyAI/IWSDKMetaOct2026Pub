import { expect, test, type Page } from '@playwright/test';

/**
 * Play-once voice lines (owner rule 2026-11-19): each store modifier
 * description and each achievement tile narrator line plays only the first
 * time, remembered across sessions through the shared first-time flags like
 * the other one-shot lines. Driven through the window.__wallTonesDebug
 * bridge; speech fetches are aborted so lines settle instantly, but the
 * request log still proves which clips the game tried to play.
 */

interface DebugSnap {
  flatAwaitingStart: boolean;
  storeOpen: boolean;
  storeSelected: string | null;
}

const readState = (page: Page): Promise<DebugSnap> =>
  page.evaluate(() => {
    const d = (window as unknown as { __wallTonesDebug: DebugSnap })
      .__wallTonesDebug;
    return {
      flatAwaitingStart: d.flatAwaitingStart,
      storeOpen: d.storeOpen,
      storeSelected: d.storeSelected,
    };
  });

const dbg = (page: Page, call: string, arg?: string): Promise<unknown> =>
  page.evaluate(
    ({ call, arg }) => {
      const d = (
        window as unknown as {
          __wallTonesDebug: Record<string, (a?: string) => unknown>;
        }
      ).__wallTonesDebug;
      return d[call]!(arg);
    },
    { call, arg },
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

const countClip = (requests: string[], file: string): number =>
  requests.filter((u) => u.includes(file)).length;

test.describe('Wall Tones play-once voices: store modifiers and achievements', () => {
  test('a store modifier description voice plays on its first tile open only, across reloads', async ({
    page,
  }) => {
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);

    await dbg(page, 'toggleStore');
    expect((await readState(page)).storeOpen).toBe(true);

    // First open of the Listen tile speaks its description line (each line
    // fires up to two requests: decode fetch + HTMLAudio fallback, so compare
    // against a settled baseline instead of clearing the log).
    await dbg(page, 'selectStoreTile', 'listen');
    expect((await readState(page)).storeSelected).toBe('listen');
    await expect
      .poll(() => countClip(speechRequests, 'store-item-listen.mp3'))
      .toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const listenBaseline = countClip(speechRequests, 'store-item-listen.mp3');

    // Re-opening the same tile stays silent...
    await dbg(page, 'selectStoreTile', 'listen'); // toggles off
    expect((await readState(page)).storeSelected).toBe(null);
    await dbg(page, 'selectStoreTile', 'listen'); // back on
    expect((await readState(page)).storeSelected).toBe('listen');
    await page.waitForTimeout(1000);
    expect(countClip(speechRequests, 'store-item-listen.mp3')).toBe(
      listenBaseline,
    );

    // ...while another tile's line still plays on its own first open.
    await dbg(page, 'selectStoreTile', 'hint');
    await expect
      .poll(() => countClip(speechRequests, 'store-item-hint.mp3'))
      .toBeGreaterThan(0);

    // The once-only memory survives a reload (same install, kept storage).
    await bootWallTones(page, false);
    await dbg(page, 'toggleStore');
    expect((await readState(page)).storeOpen).toBe(true);
    await page.waitForTimeout(1000);
    const afterReloadListen = countClip(speechRequests, 'store-item-listen.mp3');
    const afterReloadHint = countClip(speechRequests, 'store-item-hint.mp3');
    await dbg(page, 'selectStoreTile', 'listen');
    expect((await readState(page)).storeSelected).toBe('listen');
    await page.waitForTimeout(1000);
    expect(countClip(speechRequests, 'store-item-listen.mp3')).toBe(
      afterReloadListen,
    );
    expect(countClip(speechRequests, 'store-item-hint.mp3')).toBe(
      afterReloadHint,
    );
  });

  test('an achievement narrator line plays on its first tile pin-open only, across reloads', async ({
    page,
  }) => {
    const speechRequests: string[] = [];
    await abortSpeech(page, speechRequests);
    await bootWallTones(page, true);

    // The bridge call goes through the same once-only guard as a tile tap
    // (baseline compare: one line can fire two requests, decode + fallback).
    await dbg(page, 'selectAchievementTile', 'streak');
    await expect
      .poll(() => countClip(speechRequests, 'achv-streak.mp3'))
      .toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    const streakBaseline = countClip(speechRequests, 'achv-streak.mp3');

    await dbg(page, 'selectAchievementTile', 'streak');
    await page.waitForTimeout(1000);
    expect(countClip(speechRequests, 'achv-streak.mp3')).toBe(streakBaseline);

    // Another category still speaks on its own first pin-open.
    await dbg(page, 'selectAchievementTile', 'bars');
    await expect
      .poll(() => countClip(speechRequests, 'achv-bars.mp3'))
      .toBeGreaterThan(0);

    // The once-only memory survives a reload.
    await bootWallTones(page, false);
    await page.waitForTimeout(1000);
    const afterReloadStreak = countClip(speechRequests, 'achv-streak.mp3');
    const afterReloadBars = countClip(speechRequests, 'achv-bars.mp3');
    await dbg(page, 'selectAchievementTile', 'streak');
    await dbg(page, 'selectAchievementTile', 'bars');
    await page.waitForTimeout(1000);
    expect(countClip(speechRequests, 'achv-streak.mp3')).toBe(afterReloadStreak);
    expect(countClip(speechRequests, 'achv-bars.mp3')).toBe(afterReloadBars);
  });
});
