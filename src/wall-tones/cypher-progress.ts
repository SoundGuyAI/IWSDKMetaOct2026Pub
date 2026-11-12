import type { CypherLineId } from './cypher-script.js';

export interface CypherWindow {
  readonly id: string;
  readonly minStreak: number;
  readonly speaker: 'cypher' | 'narrator';
  readonly lines: readonly CypherLineId[];
  readonly fault?: boolean;
  readonly seam?: 'open' | 'closed';
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
  { id: 'seam', minStreak: 15, speaker: 'cypher', lines: ['C15', 'C16'], seam: 'open' },
  { id: 'seam-repaired', minStreak: 0, speaker: 'narrator', lines: ['N04', 'N05'], seam: 'closed' },
  { id: 'longer-window', minStreak: 0, speaker: 'cypher', lines: ['C17', 'C18', 'C19'] },
  { id: 'last-check', minStreak: 0, speaker: 'narrator', lines: ['N06', 'N07'], fault: true },
];

export const CYPHER_PROGRESS_KEY = 'wall-tones-cypher-act1-progress-v1';
interface StoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
function browserStorage(): StoryStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** Remember the next window across runs and page visits, independently of streak.
 * Completed lines are saved individually. An interrupted line can replay, but
 * finished lines do not. Skip pauses the window until the next safe boundary.
 * Restricted storage falls back to in-memory progress without blocking play.
 */
export class CypherProgress {
  private next = 0;
  private active: { index: number; offset: number } | undefined;
  constructor(private readonly storage: StoryStorage | undefined = browserStorage()) {
    try {
      const saved = JSON.parse(storage?.getItem(CYPHER_PROGRESS_KEY) ?? 'null');
      if (saved?.version === 1 && Number.isInteger(saved.next) && saved.next >= 0 && saved.next <= CYPHER_WINDOWS.length) {
        this.next = saved.next;
        if (Number.isInteger(saved.active?.index) && saved.active.index === saved.next - 1 && saved.active.index >= 0 && Number.isInteger(saved.active.offset) && saved.active.offset >= 0 && saved.active.offset < CYPHER_WINDOWS[saved.active.index]!.lines.length) this.active = saved.active;
      }
    } catch { /* invalid/private storage: start here, never affect scores */ }
  }
  private save(): void {
    try { this.storage?.setItem(CYPHER_PROGRESS_KEY, JSON.stringify({ version: 1, next: this.next, active: this.active })); }
    catch { /* private mode: retain progress in this instance */ }
  }
  takeWindow(streak: number): CypherWindow | undefined {
    const window = CYPHER_WINDOWS[this.next];
    if (!window || streak < window.minStreak) return undefined;
    this.next += 1;
    this.save();
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
  lineCompleted(): void {
    if (!this.active) return;
    this.active.offset += 1;
    if (this.active.offset >= CYPHER_WINDOWS[this.active.index]!.lines.length) this.active = undefined;
    this.save();
  }
  /** Explicit story reset only. Starting a run or leaving the game never calls it. */
  reset(): void { this.next = 0; this.active = undefined; this.save(); }
  get completedWindows(): number { return this.next; }
}
