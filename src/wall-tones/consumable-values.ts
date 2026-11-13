/**
 * TEST VALUES, CHANGE LATER. Starting balance for testing the streak saver,
 * not final prices. Every number lives here so it can be retuned in one place.
 */

/** Bars price of one streak saver. */
export const SAVER_PRICE_BARS = 18;

/** Savers one use consumes, per 10-streak stretch: streaks 1-10 use 1,
 * 11-20 use 2, 21-30 use 4, 31-40 use 8, 41-50 use 16, and the last
 * entry keeps doubling every further stretch (see saverUnitsForStreak). */
export const SAVER_UNITS_PER_STRETCH: readonly number[] = [1, 2, 4, 8, 16];
export const SAVER_STRETCH_LENGTH = 10;

/** Savers a miss at `streak` consumes. Doubles every stretch past the table. */
export function saverUnitsForStreak(streak: number): number {
  const s = Math.max(streak, 1);
  const stretch = Math.floor((s - 1) / SAVER_STRETCH_LENGTH);
  const last = SAVER_UNITS_PER_STRETCH.length - 1;
  if (stretch <= last) return SAVER_UNITS_PER_STRETCH[stretch]!;
  return SAVER_UNITS_PER_STRETCH[last]! * 2 ** (stretch - last);
}

/** One-press Game Over purchase (owner request 2026-11-11): buy exactly the
 * savers missing for an immediate retry and apply them in the same press.
 * Cost model unchanged: the press buys `need - have` units at price each. */
export function saverRetryPlan(
  haveSavers: number,
  needSavers: number,
  bars: number,
  priceBars: number,
): { buy: number; costBars: number; affordable: boolean; apply: boolean } {
  if (needSavers <= 0) return { buy: 0, costBars: 0, affordable: false, apply: false };
  const missing = Math.max(0, needSavers - haveSavers);
  const costBars = missing * priceBars;
  const affordable = bars >= costBars;
  return { buy: affordable ? missing : 0, costBars, affordable, apply: affordable };
}
