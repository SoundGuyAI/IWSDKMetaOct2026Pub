import type { CypherLineId } from './cypher-script.js';

export interface CypherWindow {
  readonly id: string;
  readonly minStreak: number;
  readonly speaker: 'cypher' | 'narrator';
  readonly lines: readonly CypherLineId[];
  readonly fault?: boolean;
  readonly seam?: 'open' | 'closed';
  /** Rift encounter gate (owner-settled Nov 18): these windows wait until all
   * three portals are sealed; the story cannot move past an open encounter. */
  readonly gate?: 'rift-sealed';
}

/** First-play preview cadence. One window per successful pattern, never over notes.
 * Five and ten are the requested anchors. Fifteen is also spoken by this script.
 * Story position persists independently of the current run. These are not purchased rewards or new score gates.
 */
export const CYPHER_WINDOWS: readonly CypherWindow[] = [
  { id: 'connection', minStreak: 5, speaker: 'cypher', lines: ['C01'] },
  { id: 'next-window', minStreak: 0, speaker: 'cypher', lines: ['C02'] },
  { id: 'keep-playing', minStreak: 0, speaker: 'cypher', lines: ['C03'] },
  { id: 'ten', minStreak: 0, speaker: 'cypher', lines: ['C04'] },
  { id: 'first-fault', minStreak: 0, speaker: 'narrator', lines: ['N01'], fault: true },
  { id: 'codename', minStreak: 10, speaker: 'cypher', lines: ['C05', 'C06'] },
  { id: 'your-machine', minStreak: 0, speaker: 'cypher', lines: ['C07', 'C08', 'C09'] },
  { id: 'hidden-channel', minStreak: 0, speaker: 'cypher', lines: ['C10', 'C11', 'C12', 'C13'] },
  { id: 'next-lock', minStreak: 0, speaker: 'cypher', lines: ['C14'] },
  { id: 'routine-repair', minStreak: 0, speaker: 'narrator', lines: ['N02', 'N03'], fault: true },
  { id: 'seam', minStreak: 15, speaker: 'cypher', lines: ['C15', 'C16A', 'C16B', 'C16C'], seam: 'open' },
  // The narrator's unexplained apology reacts to the open portals, so this
  // window is intentionally NOT rift-gated (his "doesn't know" beat, Nov 18).
  { id: 'seam-repaired', minStreak: 0, speaker: 'narrator', lines: ['N04', 'N05'], seam: 'closed' },
  { id: 'rift-reason-17', minStreak: 17, speaker: 'cypher', lines: ['C20', 'C21'], gate: 'rift-sealed' },
  { id: 'rift-reason-18', minStreak: 18, speaker: 'cypher', lines: ['C22', 'C23'], gate: 'rift-sealed' },
  { id: 'longer-window', minStreak: 0, speaker: 'cypher', lines: ['C17', 'C18', 'C19'], gate: 'rift-sealed' },
  { id: 'last-check', minStreak: 0, speaker: 'narrator', lines: ['N06', 'N07'], fault: true, gate: 'rift-sealed' },
];

/** Index of a window in the Act 1 sequence, or -1. */
export function cypherWindowIndex(id: string): number {
  return CYPHER_WINDOWS.findIndex((window) => window.id === id);
}

/** Window order every version-1 save was written against (Act 1 before the
 * rift windows). Version-1 saves store numeric positions, so reading them
 * against the longer rift table points at the wrong windows - a finished
 * player (next = 14) looked unfinished and background lines never started.
 * Map each saved position through this list to its window id, then to the
 * current index. */
const CYPHER_WINDOWS_V1_IDS = [
  'connection', 'next-window', 'keep-playing', 'ten', 'first-fault',
  'codename', 'your-machine', 'hidden-channel', 'next-lock', 'routine-repair',
  'seam', 'seam-repaired', 'longer-window', 'last-check',
] as const;

/** Current persisted save shape. */
const CYPHER_PROGRESS_VERSION = 2;

/** Translate a version-1 table position to the current table, or -1 when the
 * save is out of bounds for the table it was written against. */
function migrateV1Index(index: number): number {
  if (index > CYPHER_WINDOWS_V1_IDS.length) return -1;
  if (index === CYPHER_WINDOWS_V1_IDS.length) return CYPHER_WINDOWS.length;
  const migrated = cypherWindowIndex(CYPHER_WINDOWS_V1_IDS[index]!);
  return migrated >= 0 ? migrated : CYPHER_WINDOWS.length;
}

export const CYPHER_PROGRESS_KEY = 'wall-tones-cypher-act1-progress-v1';
interface StoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
function browserStorage(): StoryStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** Remember the next window across runs and page visits, independently of streak.
 * Started lines are saved individually, including when the player skips them.
 * Unstarted lines resume at the next safe boundary.
 * Restricted storage falls back to in-memory progress without blocking play.
 */
export class CypherProgress {
  private next = 0;
  private active: { index: number; offset: number } | undefined;
  constructor(private readonly storage: StoryStorage | undefined = browserStorage()) {
    try {
      const saved = JSON.parse(storage?.getItem(CYPHER_PROGRESS_KEY) ?? 'null');
      if (saved?.version === CYPHER_PROGRESS_VERSION && Number.isInteger(saved.next) && saved.next >= 0 && saved.next <= CYPHER_WINDOWS.length) {
        this.next = saved.next;
        if (Number.isInteger(saved.active?.index) && saved.active.index === saved.next - 1 && saved.active.index >= 0 && Number.isInteger(saved.active.offset) && saved.active.offset >= 0 && saved.active.offset < CYPHER_WINDOWS[saved.active.index]!.lines.length) this.active = saved.active;
      } else if (saved?.version === 1 && Number.isInteger(saved.next) && saved.next >= 0) {
        // Version-1 positions belong to the pre-rift table: migrate by window
        // id so existing players keep their exact story position.
        const next = migrateV1Index(saved.next);
        if (next >= 0) {
          this.next = next;
          if (Number.isInteger(saved.active?.index) && saved.active.index === saved.next - 1 && saved.active.index >= 0 && Number.isInteger(saved.active.offset)) {
            const index = migrateV1Index(saved.active.index);
            if (index >= 0 && index < CYPHER_WINDOWS.length && saved.active.offset >= 0 && saved.active.offset < CYPHER_WINDOWS[index]!.lines.length) {
              this.active = { index, offset: saved.active.offset };
            }
          }
          this.save();
        }
      }
    } catch { /* invalid/private storage: start here, never affect scores */ }
  }
  private save(): void {
    try { this.storage?.setItem(CYPHER_PROGRESS_KEY, JSON.stringify({ version: CYPHER_PROGRESS_VERSION, next: this.next, active: this.active })); }
    catch { /* private mode: retain progress in this instance */ }
  }
  takeWindow(streak: number): CypherWindow | undefined {
    const window = CYPHER_WINDOWS[this.next];
    if (!window || streak < window.minStreak) return undefined;
    this.next += 1;
    this.save();
    return window;
  }
  /** The next fresh window without consuming it (gate checks look before
   * they leap). Returns undefined while an interrupted window waits to
   * resume: beginWindow would return that one regardless of gates. */
  peekWindow(streak: number): CypherWindow | undefined {
    if (this.active) return undefined;
    const window = CYPHER_WINDOWS[this.next];
    if (!window || streak < window.minStreak) return undefined;
    return window;
  }
  /** Restore an interrupted window at its first unfinished line. Mission gates
   * still apply to a fresh window, not to one the player already unlocked. */
  beginWindow(streak: number): CypherWindow | undefined {
    if (this.active) {
      const window = CYPHER_WINDOWS[this.active.index]!;
      return { ...window, lines: window.lines.slice(this.active.offset) };
    }
    const window = this.takeWindow(streak);
    if (window) { this.active = { index: this.next - 1, offset: 0 }; this.save(); }
    return window;
  }
  /** Called at playback/caption start, not at its end. Kept for save/API compatibility. */
  lineCompleted(): void {
    if (!this.active) return;
    this.active.offset += 1;
    if (this.active.offset >= CYPHER_WINDOWS[this.active.index]!.lines.length) this.active = undefined;
    this.save();
  }
  /** Explicit story reset only. Starting a run or leaving the game never calls it. */
  reset(): void { this.next = 0; this.active = undefined; this.save(); }
  get finished(): boolean { return this.next >= CYPHER_WINDOWS.length && !this.active; }
  /** Actual fully spoken/consumed windows, excluding an in-flight window. */
  get completedWindowIds(): readonly string[] {
    const end = this.active?.index ?? this.next;
    return CYPHER_WINDOWS.slice(0, end).map(window => window.id);
  }
  get completedWindows(): number { return this.next; }
}
