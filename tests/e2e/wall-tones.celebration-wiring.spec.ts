import { expect, test, type Page } from '@playwright/test';

/**
 * Regression guard for the PR95 incident: a full-file web edit pasted from a
 * stale pre-PR88 working copy silently reverted the item-54 achievement
 * celebration wiring on the branch (the removed static
 * #wall-tones-achievement-toast text toast came back and the celebration.show
 * path was dropped). PR-time CI runs no e2e, so nothing executed the behavior
 * and the revert stayed green. This spec drives a real achievement unlock
 * through WallTonesSystem (grant Bars -> open store -> buy Top Secret) and
 * asserts the rendered celebration overlay plus the PR88 debug-bridge state.
 * It fails on the reverted tree and passes on the restored tree.
 */

const boot = async (page: Page): Promise<void> => {
  await page.route('**/audio/speech/**', (route) => route.abort());
  await page.addInitScript(() => {
    window.sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    window.localStorage.clear();
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
};

const dbg = (page: Page, call: string, arg?: number): Promise<unknown> =>
  page.evaluate(
    ([c, a]) =>
      (
        window as unknown as {
          __wallTonesDebug: Record<string, (n?: number) => unknown>;
        }
      ).__wallTonesDebug[c]!(a),
    [call, arg] as const,
  );

test.describe('Achievement celebration wiring regression (PR95 incident)', () => {
  test('purchase unlock renders the celebration overlay, never the reverted static toast', async ({
    page,
  }) => {
    await boot(page);
    await dbg(page, 'grantBars', 1000);
    await dbg(page, 'toggleStore');
    await dbg(page, 'buyTopSecret');

    // The PR88 celebration overlay renders with the unlocked achievement.
    const overlay = page.locator('.wt-achv-celebration');
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay.locator('.wt-achv-name')).toHaveText('Store 1');

    // The debug bridge exposes the celebration state PR88 added.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __wallTonesDebug: { celebrationText?: string | null };
                }
              ).__wallTonesDebug.celebrationText,
          ),
        { timeout: 10_000 },
      )
      .toBe('ACHIEVEMENT UNLOCKED|Store 1');

    // The pre-PR88 static toast must stay gone; its reappearance is the
    // exact shape of the revert this spec guards against.
    await expect(page.locator('#wall-tones-achievement-toast')).toHaveCount(0);

    // The store popup stays open through the show (PR88 behavior).
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __wallTonesDebug: { storeOpen: boolean };
              }
            ).__wallTonesDebug.storeOpen,
        ),
      )
      .toBe(true);
  });
});
