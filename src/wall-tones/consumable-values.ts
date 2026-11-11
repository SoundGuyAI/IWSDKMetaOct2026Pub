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
