/** Keep the current note in a bounded display, retaining a full last window. */
export const HINT_WINDOW_SIZE = 20;
export function hintWindowStart(length: number, current: number): number {
  return Math.max(0, Math.min(Math.floor(current), Math.max(0, length - HINT_WINDOW_SIZE)));
}
