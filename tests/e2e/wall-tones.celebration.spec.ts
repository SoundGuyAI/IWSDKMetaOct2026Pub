import { expect, test, type Page } from '@playwright/test';

/**
 * Achievement unlock celebration E2E (item 54): the approved flare replaces
 * the plain panel text toast. Desktop flat mode: a center-screen DOM overlay
 * with the burst, letter cascade, per-achievement logo and the fly-in to the
 * Achievements button; simultaneous unlocks queue and play one at a time.
 * Driven through the window.__wallTonesDebug bridge like the economy spec.
 */

interface CelebrationDebug {
  celebrationActive: boolean;
  celebrationText: string | null;
  celebrationSfxPlays: number;
  ownsTopSecret: boolean;
  unlockedAchievements: string[];
}

const readCelebration = (page: Page): Promise<CelebrationDebug> =>
  page.evaluate(() => {
    const d = (window as unknown as { __wallTonesDebug: CelebrationDebug })
      .__wallTonesDebug;
    return {
      celebrationActive: d.celebrationActive,
      celebrationText: d.celebrationText,
      celebrationSfxPlays: d.celebrationSfxPlays,
      ownsTopSecret: d.ownsTopSecret,
      unlockedAchievements: [...d.unlockedAchievements],
    };
  });

const dbg = (page: Page, call: string): Promise<unknown> =>
  page.evaluate(
    (c) =>
      (
        window as unknown as {
          __wallTonesDebug: Record<string, (n?: number) => unknown>;
        }
      ).__wallTonesDebug[c]!(),
    call,
  );

const grantBars = (page: Page, amount: number): Promise<unknown> =>
  page.evaluate(
    (n) =>
      (
        window as unknown as { __wallTonesDebug: { grantBars(a: number): void } }
      ).__wallTonesDebug.grantBars(n),
    amount,
  );

const submitPad = (page: Page, padIndex: number): Promise<void> =>
  page.evaluate(
    (index) =>
      (window as unknown as { __wallTonesDebug: { submitPad(i: number): void } })
        .__wallTonesDebug.submitPad(index),
    padIndex,
  );

/** Fail every clip fast; the celebration is visual-only regardless. */
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
    () =>
      Boolean((window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug),
    undefined,
    { timeout: 60_000 },
  );
  await expect
    .poll(async () => (await readCelebration(page)).celebrationActive, {
      timeout: 60_000,
    })
    .toBe(false);
}

test.describe('Wall Tones achievement unlock celebration (item 54)', () => {
  test('a purchase unlock plays the center-screen celebration and simultaneous unlocks queue', async ({
    page,
  }) => {
    await abortSpeech(page);
    await bootWallTones(page);
    await grantBars(page, 100_000); // Secret costs 100,000

    // Capture the Achievements button's home position with no popup open:
    // the fly-in must land there even after the store popup hides
    // menu-view (owner call 2026-11-13: the celebration stays in front of
    // the popup; the popup is NOT dismissed).
    const home = await page.evaluate(
      () =>
        (
          window as unknown as {
            __wallTonesDebug: {
              achievementsButtonScreen: { x: number; y: number } | null;
            };
          }
        ).__wallTonesDebug.achievementsButtonScreen,
    );
    expect(home).not.toBeNull();

    await dbg(page, 'toggleStore');
    await dbg(page, 'buyTopSecret');

    // The purchase unlocks Store 1 first, then Secret Revealed: two queued
    // shows, played one at a time in unlock order.
    await expect
      .poll(async () => (await readCelebration(page)).celebrationText, {
        timeout: 10_000,
      })
      .toBe('ACHIEVEMENT UNLOCKED|Store 1');

    // Overlay structure: flash/ring/sparks, badge with the category logo,
    // the letter cascade and the achievement name.
    const overlay = page.locator('.wt-achv-celebration');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.wt-achv-letter')).toHaveCount(20);
    await expect(overlay.locator('.wt-achv-name')).toHaveText('Store 1');
    await expect(overlay.locator('.wt-achv-badge-disc img')).toBeAttached();

    // Foreground layering: the store popup stays OPEN through the show.
    const storeStillOpen = await page.evaluate(
      () =>
        (window as unknown as { __wallTonesDebug: { storeOpen: boolean } })
          .__wallTonesDebug.storeOpen,
    );
    expect(storeStillOpen).toBe(true);

    // With menu-view hidden the button's live layout collapses to the panel
    // corner, so the fly-in targets its pre-popup home position: the target
    // pulse lands where the button lives in the menu layout.
    const pulse = page.locator('.wt-achv-target-pulse');
    await pulse.waitFor({ state: 'attached', timeout: 8_000 });
    const box = (await pulse.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - home!.x)).toBeLessThan(8);
    expect(Math.abs(box.y + box.height / 2 - home!.y)).toBeLessThan(8);

    // Second queued show after the first finishes (3.1s each).
    await expect
      .poll(async () => (await readCelebration(page)).celebrationText, {
        timeout: 10_000,
      })
      .toBe('ACHIEVEMENT UNLOCKED|Secret Revealed');
    await expect(overlay.locator('.wt-achv-name')).toHaveText('Secret Revealed');

    // Both shows complete: the overlay is removed and the queue is empty.
    await expect
      .poll(async () => (await readCelebration(page)).celebrationActive, {
        timeout: 15_000,
      })
      .toBe(false);
    await expect(page.locator('.wt-achv-celebration')).toHaveCount(0);

    // The popup survived both queued shows untouched.
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __wallTonesDebug: { storeOpen: boolean } })
              .__wallTonesDebug.storeOpen,
        ),
      )
      .toBe(true);

    const snap = await readCelebration(page);
    // Both queued shows requested their synthesized sound effects (user ask,
    // November 14): two shows played, two SFX sequences.
    expect(snap.celebrationSfxPlays).toBe(2);
    expect(snap.ownsTopSecret).toBe(true);
    expect(snap.unlockedAchievements).toContain('secret-1');
    expect(snap.unlockedAchievements).toContain('store-1');
  });

  test('the Streak celebration shows the rotating 3D flame pilot logo', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    await bootWallTones(page);
    await submitPad(page, 0); // start tap
    // Reach streak 5 through real pattern input (economy spec helper path).
    for (let round = 0; round < 5; round += 1) {
      await expect
        .poll(
          async () =>
            page.evaluate(
              () =>
                (window as unknown as { __wallTonesDebug: { phase: string } })
                  .__wallTonesDebug.phase,
            ),
          { timeout: 90_000 },
        )
        .toBe('input');
      const step = await page.evaluate(() => {
        const d = (window as unknown as {
          __wallTonesDebug: { sequence: number[]; inputStep: number };
        }).__wallTonesDebug;
        return d.sequence[d.inputStep]!;
      });
      const inputStep = await page.evaluate(
        () =>
          (window as unknown as { __wallTonesDebug: { inputStep: number } })
            .__wallTonesDebug.inputStep,
      );
      const length = await page.evaluate(
        () =>
          (window as unknown as { __wallTonesDebug: { sequence: number[] } })
            .__wallTonesDebug.sequence.length,
      );
      await submitPad(page, step);
      if (inputStep + 1 < length) round -= 1; // multi-note round: keep going
    }

    // The Streak 5 unlock queues behind any Bars milestone earned earlier.
    await expect
      .poll(
        async () => {
          const snap = await readCelebration(page);
          if (snap.celebrationText !== 'ACHIEVEMENT UNLOCKED|Streak 5') return false;
          // The 3D flame canvas (WebGL) or its 2D fallback image must be up.
          const badgeContent = await page
            .locator('.wt-achv-celebration .wt-achv-badge-disc > *')
            .count();
          return badgeContent > 0;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(page.locator('.wt-achv-celebration .wt-achv-name')).toHaveText(
      'Streak 5',
    );

    await expect
      .poll(async () => (await readCelebration(page)).celebrationActive, {
        timeout: 20_000,
      })
      .toBe(false);
    expect(
      (await readCelebration(page)).unlockedAchievements,
    ).toContain('streak-5');
  });

  test('a Movement unlock celebration shows the drawn glyph (the category has no PNG art)', async ({
    page,
  }) => {
    test.slow();
    await abortSpeech(page);
    // Seed lifetime movement past the first Movement threshold (10 m); the
    // economy's boot-time achievement check then queues Movement 10. Custom
    // boot instead of bootWallTones: the seed must survive the storage clear.
    //
    // The show fires DURING boot: its clock advances by frame delta, so on a
    // loaded CI runner one slow frame (delta >= show duration) plays it start
    // to finish before the debug bridge even exists - a post-boot poll of the
    // live overlay can then never observe it (PR75 union-tree CI flake, Nov
    // 16). Record the real show from before the page scripts run instead, and
    // assert the durable unlock plus the recorded overlay facts.
    await page.addInitScript(() => {
      window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
      window.localStorage.clear();
      window.localStorage.setItem('wall-tones-move-head-m', '12');
      const seen = { title: false, name: false, glyphLoaded: false };
      (
        window as unknown as { __movementCelebrationSeen: typeof seen }
      ).__movementCelebrationSeen = seen;
      const inspect = (overlay: Element): void => {
        // The title is one span per letter; the space glyph can be a
        // non-breaking space, so match it with \s+.
        if (/ACHIEVEMENT\s+UNLOCKED/.test(overlay.textContent ?? '')) {
          seen.title = true;
        }
        if (
          overlay.querySelector('.wt-achv-name')?.textContent?.trim() ===
          'Movement 10'
        ) {
          seen.name = true;
        }
        // Regression (owner report, Nov 15): the badge disc stayed empty
        // because Movement has no embedded PNG art; it must show the drawn
        // glyph, really loaded (naturalWidth > 0), not a broken image.
        const img = overlay.querySelector<HTMLImageElement>(
          '.wt-achv-badge-disc img',
        );
        if (img != null) {
          if (img.naturalWidth > 0) {
            seen.glyphLoaded = true;
          } else {
            img.addEventListener(
              'load',
              () => {
                seen.glyphLoaded = true;
              },
              { once: true },
            );
          }
        }
      };
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            // The whole overlay (title letters, name, badge img) is built
            // synchronously and appended once, so addedNodes carry every
            // fact even when a same-frame teardown detaches it again.
            if (node.classList.contains('wt-achv-celebration')) {
              inspect(node);
            } else {
              const overlay = node.querySelector('.wt-achv-celebration');
              if (overlay != null) inspect(overlay);
            }
          }
        }
        // Observe the Document itself: an init script runs before
        // document.documentElement exists.
      }).observe(document, {
        childList: true,
        subtree: true,
      });
    });
    await page.goto('/');
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __wallTonesDebug?: unknown }).__wallTonesDebug,
        ),
      undefined,
      { timeout: 60_000 },
    );

    // Durable proof the boot-time achievement check fired from the seed.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __wallTonesDebug: { unlockedAchievements: string[] };
                }
              ).__wallTonesDebug.unlockedAchievements,
          ),
        { timeout: 30_000 },
      )
      .toContain('movement-10');

    // The recorded show: the title, the achievement name and the drawn glyph
    // really loaded - every fact the live-overlay assertions checked, without
    // the boot-timing observation window.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __movementCelebrationSeen: {
                    title: boolean;
                    name: boolean;
                    glyphLoaded: boolean;
                  };
                }
              ).__movementCelebrationSeen,
          ),
        { timeout: 30_000 },
      )
      .toEqual({ title: true, name: true, glyphLoaded: true });

    // The show completes and the queue empties.
    await expect
      .poll(async () => (await readCelebration(page)).celebrationActive, {
        timeout: 30_000,
      })
      .toBe(false);
    await expect(page.locator('.wt-achv-celebration')).toHaveCount(0);
  });
});
