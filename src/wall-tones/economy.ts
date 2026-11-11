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
const PURCHASES_KEY = 'wall-tones-purchases';
const PRESSES_KEY = 'wall-tones-presses';
const TOP_SECRET_KEY = 'wall-tones-top-secret';
const SAVERS_KEY = 'wall-tones-savers';

// Tunable store prices. The user's examples are 10/15/22 Bars for the first
// three levels; each further level keeps growing at about 1.3x ("each next 5
// costs more", tunable later). Open-ended by design: no level cap.
export const HINT_BASE_COSTS: readonly number[] = [10, 15, 22];
export const HINT_COST_GROWTH = 1.3;
/** Your Turn hint reveals this many pattern boxes per owned level. */
export const HINT_BOXES_PER_LEVEL = 5;

/** One-time Top Secret store item price (user-settled Nov 7): grants the
 * hidden Secret Revealed achievement and nothing else. */
export const TOP_SECRET_COST = 1000;

/** Bars per correct pad press (provisional value, user to calibrate). */
export const PRESS_BARS = 1;

/** Bars awarded for completing a pattern at a given streak: 1 for streaks
 * 1-5, 2 for 6-10, 4 for 11-15, doubling every five. Also the rate base of
 * the new-record bonus (rate x streak). */
export function barsForStreak(streak: number): number {
  if (streak < 1) return 0;
  return 2 ** Math.floor((streak - 1) / 5);
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
}

/** Achievement categories with levels (user redesign): one row per category
 * in the popup; the level counts thresholds reached from lifetime counters.
 * Store/presses levels are provisional, user to calibrate. The secret
 * category is the Top Secret store purchase (user-settled Nov 7, backlog 13);
 * the popup masks its label as ??? until unlocked. */
export interface AchievementCategory {
  id: string;
  label: string;
  description: string;
  /** Ascending thresholds; level = how many are reached. */
  levels: readonly number[];
  hidden?: boolean;
}

/** Open-ended levels (backlog 39, user approved "for now"): past the listed
 * thresholds, categories keep leveling on the 10/25/50/100 pattern repeated
 * per decade (100, 250, 500, 1000, 2500, 5000, 10000, ...). Listed
 * thresholds are never changed; the hidden Secret category stays single level. */
export function nextOpenThreshold(after: number): number {
  for (let scale = 1; ; scale *= 10) {
    for (const m of [10, 25, 50]) {
      const t = m * scale;
      if (t > after) return t;
    }
  }
}

/** Every threshold a value has reached: the listed ones, then open levels. */
export function reachedThresholds(cat: { levels: readonly number[]; hidden?: boolean }, value: number): number[] {
  const out: number[] = [];
  for (const t of cat.levels) if (value >= t) out.push(t);
  if (cat.hidden === true || out.length < cat.levels.length) return out;
  let t = nextOpenThreshold(cat.levels[cat.levels.length - 1]!);
  while (value >= t) {
    out.push(t);
    t = nextOpenThreshold(t);
  }
  return out;
}

export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  { id: 'streak', label: 'Streak', description: 'Best pattern streak.', levels: [5, 10, 15, 20, 25] },
  { id: 'bars', label: 'Bars', description: 'Lifetime gold Bars earned.', levels: [25, 50, 100] },
  { id: 'score', label: 'Total Score', description: 'Lifetime score: one point per Bar earned.', levels: [50, 100, 250] },
  { id: 'store', label: 'Store', description: 'Store purchases (provisional levels).', levels: [1, 3, 5, 10, 25] },
  { id: 'presses', label: 'Pad presses', description: 'Pad presses in the game, lifetime (provisional levels).', levels: [50, 100, 250, 500, 1000] },
  { id: 'secret', label: 'Secret Revealed', description: 'A secret. It stays secret.', levels: [1], hidden: true },
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

/** Debug stat reset (Settings > Accessibility): clears every persisted stat
 * the economy and progression own. Settings/accessibility prefs survive.
 * Callers reload the page afterwards so in-memory state re-reads cleanly. */
export function resetWallTonesStats(): void {
for (const key of [
BARS_KEY,
BARS_TOTAL_KEY,
HINT_LEVEL_KEY,
ACHIEVEMENTS_KEY,
FIRST_FLAGS_KEY,
BEST_STREAK_KEY,
PURCHASES_KEY,
PRESSES_KEY,
TOP_SECRET_KEY,
SAVERS_KEY,
]) {
try { globalThis.localStorage?.removeItem(key); } catch { /* private mode */ }
}
}

export class WallTonesEconomy {
  private bars = readNumber(BARS_KEY);
  private barsTotal = readNumber(BARS_TOTAL_KEY);
  private hintLevel = readNumber(HINT_LEVEL_KEY);
  private unlocked = new Set(readStringArray(ACHIEVEMENTS_KEY));
  private firstFlags = new Set(readStringArray(FIRST_FLAGS_KEY));
  private purchases = readNumber(PURCHASES_KEY);
  private presses = readNumber(PRESSES_KEY);
  private topSecretOwned = readNumber(TOP_SECRET_KEY) === 1;
  private savers = readNumber(SAVERS_KEY);
  /** Latest unlocks since the last drain, for a visual panel toast. */
  private pendingToasts: AchievementDef[] = [];

  getBars(): number {
    return this.bars;
  }

  getBarsTotal(): number {
    return this.barsTotal;
  }

  /** Streak savers in stock (test-value consumable, see consumable-values). */
  getSavers(): number {
    return this.savers;
  }

  /** Buy one saver for `price` Bars. Never partial. */
  buySaver(price: number): boolean {
    if (this.bars < price) return false;
    this.bars -= price;
    this.savers += 1;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(SAVERS_KEY, this.savers);
    this.purchases += 1;
    writeNumber(PURCHASES_KEY, this.purchases);
    this.checkAchievements(0);
    return true;
  }

  /** Spend `units` savers only when the full amount is owned. */
  useSavers(units: number): boolean {
    if (units < 1 || this.savers < units) return false;
    this.savers -= units;
    writeNumber(SAVERS_KEY, this.savers);
    return true;
  }

  getHintLevel(): number {
    return this.hintLevel;
  }

  /** Lifetime store purchases (Store achievements category). */
  getPurchases(): number {
    return this.purchases;
  }

  /** Lifetime correct pad presses (Pad presses achievements category). */
  getPresses(): number {
    return this.presses;
  }

  /** Whether the one-time Top Secret item was bought. */
  ownsTopSecret(): boolean {
    return this.topSecretOwned;
  }

  /** Popup progress for one category: current value, level, next threshold. */
  getCategoryProgress(
    id: string,
    liveStreak = 0,
  ): { value: number; level: number; next: number | null } {
    const cat = ACHIEVEMENT_CATEGORIES.find((c) => c.id === id);
    if (cat == null) return { value: 0, level: 0, next: null };
    const value = this.categoryValue(cat, liveStreak);
    const reached = reachedThresholds(cat, value);
    const level = reached.length;
    const last = reached[level - 1];
    let next: number | null;
    if (level < cat.levels.length) next = cat.levels[level]!;
    else if (cat.hidden === true) next = null;
    else next = nextOpenThreshold(last ?? cat.levels[cat.levels.length - 1]!);
    return { value, level, next };
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

  /** Award Bars for one correct pad press (user-settled: every press is a
   * reward; PRESS_BARS is a provisional value to calibrate). */
  awardForPress(streak: number): number {
    return this.award(PRESS_BARS, streak);
  }

  /** Count one eligible gameplay pad press (Pad presses category). Correct
   * and wrong presses both count; playback, menu and setup input never
   * reaches the caller (user-settled: presses "in the game"). */
  countGameplayPress(liveStreak: number): void {
    this.presses += 1;
    writeNumber(PRESSES_KEY, this.presses);
    this.checkAchievements(liveStreak);
  }

  /** Pattern end. Always pays the completion extra (band rate, user-settled
   * additive on top of per-press earnings) and counts the first-pattern
   * achievement; when the completed pattern set a new best streak, also
   * pays the record bonus of rate x streak (exponential: 5 -> +5,
   * 10 -> +20, 15 -> +60, 20 -> +160). Returns both parts for the round
   * summary breakdown. */
  completePattern(
    streak: number,
    recordBeaten: boolean,
  ): { completion: number; bonus: number } {
    const completion = this.award(barsForStreak(streak), streak);
    const bonus = recordBeaten
      ? this.award(barsForStreak(streak) * streak, streak)
      : 0;
    return { completion, bonus };
  }

  private award(amount: number, streak: number): number {
    if (amount <= 0) return 0;
    this.bars += amount;
    this.barsTotal += amount;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(BARS_TOTAL_KEY, this.barsTotal);
    this.checkAchievements(streak);
    return amount;
  }

  private categoryValue(cat: AchievementCategory, liveStreak: number): number {
    switch (cat.id) {
      case 'streak':
        // Live streak covers a record in flight, before saveBestStreak lands.
        return Math.max(liveStreak, this.getBestStreak());
      case 'bars':
      case 'score':
        // User-settled: Total Score == lifetime Bars earned, never decreases.
        return this.barsTotal;
      case 'store':
        return this.purchases;
      case 'presses':
        return this.presses;
      default:
        // secret: the Top Secret purchase (user-settled Nov 7, backlog 13).
        return this.topSecretOwned ? 1 : 0;
    }
  }

  /** Unlock every category threshold the counters now pass; toasts queue. */
  private checkAchievements(liveStreak: number): void {
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      if (cat.hidden) continue;
      const value = this.categoryValue(cat, liveStreak);
      for (const threshold of reachedThresholds(cat, value)) {
        this.unlock(`${cat.id}-${threshold}`, `${cat.label} ${threshold}`, cat.description);
      }
    }
  }

  /** Buy the next hint level. Returns true when the purchase landed. */
  buyNextHintLevel(): boolean {
    const cost = this.hintCost(this.hintLevel + 1);
    if (this.bars < cost) return false;
    this.bars -= cost;
    this.hintLevel += 1;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(HINT_LEVEL_KEY, this.hintLevel);
    this.purchases += 1;
    writeNumber(PURCHASES_KEY, this.purchases);
    this.checkAchievements(0);
    return true;
  }

  /** Buy the one-time Top Secret item (user-settled Nov 7): 1000 Bars,
   * grants the hidden Secret Revealed achievement, no other reward. */
  buyTopSecret(): boolean {
    if (this.topSecretOwned || this.bars < TOP_SECRET_COST) return false;
    this.bars -= TOP_SECRET_COST;
    this.topSecretOwned = true;
    writeNumber(BARS_KEY, this.bars);
    writeNumber(TOP_SECRET_KEY, 1);
    this.purchases += 1;
    writeNumber(PURCHASES_KEY, this.purchases);
    this.unlock('secret-1', 'Secret Revealed', 'A secret. It stays secret.');
    this.checkAchievements(0);
    return true;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Total unlocked achievements; a complete change key since unlocks only grow. */
  getUnlockedCount(): number {
    return this.unlocked.size;
  }

  private unlock(id: string, label: string, description: string): void {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    writeStringArray(ACHIEVEMENTS_KEY, [...this.unlocked]);
    this.pendingToasts.push({ id, label, description });
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

  /** Test-only: seed saver inventory without a purchase. */
  debugGrantSavers(units: number): void {
    if (units > 0) {
      this.savers += Math.floor(units);
      writeNumber(SAVERS_KEY, this.savers);
    }
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
