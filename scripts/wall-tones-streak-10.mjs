/** Play Wall Tones in flat mode until bestStreak reaches target (dev automation). */
export default async function run({ page, frame }) {
  const surface = frame ?? page;
  await surface.evaluate(() => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
  });
  await surface.evaluate(() => {
    location.reload();
  });
  await page.waitForLoadState('networkidle');
  await surface.waitForFunction(() => window.__wallTonesDebug != null, null, {
    timeout: 90000,
  });

  const target = 10;
  const deadline = Date.now() + 95000;

  while (Date.now() < deadline) {
    const state = await surface.evaluate(() => {
      const debug = window.__wallTonesDebug;
      if (debug == null) {
        return null;
      }
      return {
        phase: debug.phase,
        sequence: [...debug.sequence],
        inputStep: debug.inputStep,
        streak: debug.streak,
        bestStreak: debug.bestStreak,
      };
    });
    if (state == null) {
      await page.waitForTimeout(200);
      continue;
    }
    if (state.bestStreak >= target) {
      return { ok: true, bestStreak: state.bestStreak, streak: state.streak };
    }
    if (state.phase === 'input' && state.sequence.length > 0) {
      const padIndex = state.sequence[state.inputStep];
      if (padIndex != null) {
        await surface.evaluate((index) => {
          window.__wallTonesDebug?.submitPad(index);
        }, padIndex);
      }
    }
    await page.waitForTimeout(120);
  }

  const finalState = await surface.evaluate(() => {
    const debug = window.__wallTonesDebug;
    return debug == null
      ? { bestStreak: 0, streak: 0 }
      : { bestStreak: debug.bestStreak, streak: debug.streak };
  });
  return { ok: finalState.bestStreak >= target, ...finalState };
}
