import type { WallTonesClipId } from './speech.js';

/**
 * Combined mode speaks one line for what was actually found: a dedicated
 * prompt when both walls and tables are available, otherwise the existing
 * single-surface line (user, November 11).
 */
export function combinedPickSpeechLines(
  wallCount: number,
  tableCount: number,
): WallTonesClipId[] {
  if (wallCount > 0 && tableCount > 0) {
    return ['pickCombinedSlots'];
  }
  if (wallCount > 0) {
    return ['pickWallSlots'];
  }
  if (tableCount > 0) {
    return ['pickTableSlots'];
  }
  return [];
}
