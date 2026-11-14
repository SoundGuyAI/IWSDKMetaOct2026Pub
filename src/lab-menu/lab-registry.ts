/**
 * Shared Lab menu registry.
 *
 * The Lab menu lists capability demos. They are research demos of what the app
 * can do (hand, head and voice input and similar), not part of the main
 * gameplay yet; they are meant to be integrated into gameplay later.
 *
 * Each Lab feature PR connects itself with a one-line change here: set `mode`
 * to its experience mode and `available` to true. The foundation PR ships the
 * known demos as "not connected yet" so no feature PR has to be merged to
 * assemble the menu.
 */
export interface LabEntry {
  /** Stable id. The menu row button is `lab-row-<id>-button`. */
  readonly id: string;
  readonly label: string;
  /** Experience mode the row opens. Set by the feature PR that connects it. */
  readonly mode?: string;
  readonly available: boolean;
}

export const LAB_ENTRIES: readonly LabEntry[] = [
  { id: 'nod', label: 'Nod Yes/No Lab', available: false },
  { id: 'thumbs', label: 'Thumbs Yes/No Lab', available: false },
];

export const LAB_STATUS_UNAVAILABLE = 'not connected';

export const LAB_INTRO =
  'Capability demos. These show what the app can do today and are not part of the main game yet. They are meant to be integrated into gameplay later.';

export function labRowButtonId(entry: LabEntry): string {
  return `lab-row-${entry.id}-button`;
}

export function labRowLabel(entry: LabEntry): string {
  return entry.available ? entry.label : `${entry.label} (${LAB_STATUS_UNAVAILABLE})`;
}

/** The mode a row opens, or null when the demo is not connected. */
export function labRowTarget(entry: LabEntry): string | null {
  return entry.available && entry.mode != null ? entry.mode : null;
}
