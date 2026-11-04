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
  const deadline = Date.now() + 180000;
  let started = false;
  const transitions = [];

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
        flatAwaitingStart: debug.flatAwaitingStart,
      };
    });
    if (state == null) {
      await page.waitForTimeout(200);
      continue;
    }
    if (state.bestStreak >= target) {
      return {
        ok: true,
        bestStreak: state.bestStreak,
        streak: state.streak,
        transitions,
      };
    }
    if (
      !started &&
      (state.flatAwaitingStart ||
        (state.phase === 'idle' && state.sequence.length === 0))
    ) {
      await surface.evaluate(() => {
        window.__wallTonesDebug?.submitPad(0);
      });
      started = true;
      transitions.push('started');
      await surface.waitForFunction(
        () => window.__wallTonesDebug?.phase === 'input',
        null,
        { timeout: 30000 },
      );
      transitions.push('first-input');
      continue;
    }
    if (state.phase === 'input' && state.sequence.length > 0) {
      const beforeLen = state.sequence.length;
      const beforeStreak = state.bestStreak;
      for (let step = state.inputStep; step < state.sequence.length; step += 1) {
        const padIndex = state.sequence[step];
        if (padIndex == null) {
          break;
        }
        await surface.evaluate((index) => {
          window.__wallTonesDebug?.submitPad(index);
        }, padIndex);
        await page.waitForTimeout(80);
      }
      // Wait until the next longer sequence is ready for input (round advanced).
      await surface.waitForFunction(
        ({ len, streak }) => {
          const debug = window.__wallTonesDebug;
          if (debug == null) {
            return false;
          }
          return (
            debug.phase === 'input' &&
            (debug.sequence.length > len || debug.bestStreak > streak)
          );
        },
        { len: beforeLen, streak: beforeStreak },
        { timeout: 20000 },
      );
      transitions.push(`advanced-to-${beforeLen + 1}`);
      continue;
    }
    await page.waitForTimeout(120);
  }

  const finalState = await surface.evaluate(() => {
    const debug = window.__wallTonesDebug;
    return debug == null
      ? { bestStreak: 0, streak: 0, phase: 'missing' }
      : {
          bestStreak: debug.bestStreak,
          streak: debug.streak,
          phase: debug.phase,
          sequence: [...debug.sequence],
        };
  });
  return { ok: finalState.bestStreak >= target, ...finalState, transitions };
}
