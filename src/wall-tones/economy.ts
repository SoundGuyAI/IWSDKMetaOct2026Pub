/**
 * Wall Tones economy: gold Bars, hint unlocks, achievements, first-time flags.
 * Everything persists in localStorage so progress survives reloads (backlog 18).
 * Private-mode storage failures degrade to in-memory state, same as the
 * accessibility settings.
 */

const BARS_KEY = 'wall-tones-bars';
const BARS_TOTAL_KEY = 'wall-tones-bars-total';
const HINT_LEVEL_KEY = 'wall-tones-hint-level';
const ACHIEVEMENTS_KEY = 'wall-tones-achievements';
const FIRST_FLAGS_KEY = 'wall-tones-first-flags';
const BEST_STREAK_KEY = 'wall-tones-best-streak';

// Tunable store prices. The user's examples are 10/15/22 Bars for the first
// three levels; each further level keeps growing at about 1.3x ("each next 5
// costs more", tunable later). Open-ended by design: no level cap.
export const HINT_BASE_COSTS: readonly number[] = [10, 15, 22];
export const HINT_COST_GROWTH = 1.3;
/** Your Turn hint reveals this many pattern boxes per owned level. */
export const HINT_BOXES_PER_LEVEL = 5;

/** Bars awarded for completing a pattern at a given streak: 1 for streaks
 * 1-5, 2 for 6-10, 4 for 11-15, doubling every five. */
export function barsForStreak(streak: number): number {
  if (streak < 1) return 0;
  return 2 ** Math.floor((streak - 1) / 5);
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-pattern', label: 'First pattern', description: 'Complete your first pattern.' },
  { id: 'streak-5', label: 'Warming up', description: 'Reach a streak of 5.' },
  { id: 'streak-10', label: 'On a roll', description: 'Reach a streak of 10.' },
  { id: 'streak-15', label: 'Wall whisperer', description: 'Reach a streak of 15.' },
  { id: 'streak-20', label: 'Unwallable', description: 'Reach a streak of 20.' },
  { id: 'bars-25', label: 'Pocket change', description: 'Earn 25 gold Bars in total.' },
  { id: 'bars-100', label: 'Bar tycoon', description: 'Earn 100 gold Bars in total.' },
  { id: 'first-purchase', label: 'First splurge', description: 'Buy your first store item.' },
];

function readNumber(key: string): number {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const value = raw == null ? 0 : Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    /* session may be private */
  }
}

function readStringArray(key: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, value: string[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* session may be private */
  }
}

export class WallTonesEconomy {
  private bars = readNumber(BARS_KEY);
  private barsTotal = readNumber(BARS_TOTAL_KEY);
  private hintLevel = readNumber(HINT_LEVEL_KEY);
  private unlocked = new Set(readStringArray(ACHIEVEMENTS_KEY));
  private firstFlags = new Set(readStringArray(FIRST_FLAGS_KEY));
  /** Latest unlocks since the last drain, for a visual panel toast. */
  private pendingToasts: AchievementDef[] = [];

  getBars(): number {
    return this.bars;
  }

  getBarsTotal(): number {
    return this.barsTotal;
  }

  getHintLevel(): number {
    return this.hintLevel;
  }

  /** Pattern boxes revealed during Your Turn at the owned hint level. */
  getHintRevealCount(): number {
    return this.hintLevel * HINT_BOXES_PER_LEVEL;
  }

  /** Cost of buying hint level `level` (1-based). Open-ended progression. */
  hintCost(level: number): number {
    if (level <= HINT_BASE_COSTS.length) return HINT_BASE_COSTS[Math.max(level, 1) - 1]!;
    let cost = HINT_BASE_COSTS[HINT_BASE_COSTS.length - 1]!;
    for (let i = HINT_BASE_COSTS.length; i < level; i++) {
      cost = Math.round(cost * HINT_COST_GROWTH);
    }
    return cost;
  }

  /** Award Bars for a completed pattern; returns the amount awarded. */
  awardForStreak(streak: number): number {
    const amount = barsForStreak(streak);
    if (amount <= 0) return 0;
    this.bars += amount;
    this.barsTotal += amount;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(BARS_TOTAL_KEY, this.barsTotal);
    if (streak >= 1) this.unlock('first-pattern');
    if (streak >= 5) this.unlock('streak-5');
    if (streak >= 10) this.unlock('streak-10');
    if (streak >= 15) this.unlock('streak-15');
    if (streak >= 20) this.unlock('streak-20');
    if (this.barsTotal >= 25) this.unlock('bars-25');
    if (this.barsTotal >= 100) this.unlock('bars-100');
    return amount;
  }

  /** Buy the next hint level. Returns true when the purchase landed. */
  buyNextHintLevel(): boolean {
    const cost = this.hintCost(this.hintLevel + 1);
    if (this.bars < cost) return false;
    this.bars -= cost;
    this.hintLevel += 1;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(HINT_LEVEL_KEY, this.hintLevel);
    this.unlock('first-purchase');
    return true;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  private unlock(id: string): void {
    if (this.unlocked.has(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (def == null) return;
    this.unlocked.add(id);
    writeStringArray(ACHIEVEMENTS_KEY, [...this.unlocked]);
    this.pendingToasts.push(def);
  }

  /** Achievement unlocks not yet shown; clears the queue. */
  drainToasts(): AchievementDef[] {
    const out = this.pendingToasts;
    this.pendingToasts = [];
    return out;
  }

  /** Test-only funding used by the e2e debug bridge. */
  debugGrant(amount: number): void {
    this.bars += amount;
    writeNumber(BARS_KEY, this.bars);
  }

  /** Backlog 18: the best streak persists across reloads and mode entries. */
  getBestStreak(): number {
    return readNumber(BEST_STREAK_KEY);
  }

  saveBestStreak(streak: number): void {
    if (streak > this.getBestStreak()) writeNumber(BEST_STREAK_KEY, streak);
  }

  /** True once per key per install, then false. Use for one-shot voice lines. */
  takeFirstTime(key: string): boolean {
    if (this.firstFlags.has(key)) return false;
    this.firstFlags.add(key);
    writeStringArray(FIRST_FLAGS_KEY, [...this.firstFlags]);
    return true;
  }
}
