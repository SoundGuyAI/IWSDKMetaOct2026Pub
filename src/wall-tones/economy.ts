/**
 * Wall Tones economy: gold Bars, hint unlocks, achievements, first-time flags.
 * Everything persists in localStorage so progress survives reloads (backlog 18).
 * Private-mode storage failures degrade to in-memory state, same as the
 * accessibility settings.
 */

import { MOVEMENT_STORAGE_KEYS, readLifetimeMovementMeters } from './movement.js';
import { BACKGROUND_PROGRESS_KEY } from './cypher-background.js';
import { CYPHER_PROGRESS_KEY } from './cypher-progress.js';

const BARS_KEY = 'wall-tones-bars';
const BARS_TOTAL_KEY = 'wall-tones-bars-total';
/** AutoPlay-completed rounds still pay their Bars to the spendable balance,
 * but AutoPlay is not the human player (owner rule 2026-11-15): those Bars
 * are tracked apart so lifetime Bars/Total Score achievements only count
 * Bars the human earned. */
const AUTOPLAY_BARS_TOTAL_KEY = 'wall-tones-autoplay-bars-total';
/** AutoPlay on/off (owner 2026-11-15: enable/disable get voice notices).
 * Owning AutoPlay keeps it on until the player switches it off. */
const AUTOPLAY_DISABLED_KEY = 'wall-tones-autoplay-disabled';
const HINT_LEVEL_KEY = 'wall-tones-hint-level';
const ACHIEVEMENTS_KEY = 'wall-tones-achievements';
const FIRST_FLAGS_KEY = 'wall-tones-first-flags';
const BEST_STREAK_KEY = 'wall-tones-best-streak';
const PURCHASES_KEY = 'wall-tones-purchases';
const PRESSES_KEY = 'wall-tones-presses';
const TOP_SECRET_KEY = 'wall-tones-top-secret';
const LISTEN_KEY = 'wall-tones-listen-owned';
const AUTOPLAY_LEVEL_KEY = 'wall-tones-autoplay-level';
const REPLAY_FREE_KEY = 'wall-tones-replays-free';
const REPLAY_PAID_KEY = 'wall-tones-replays-paid';
const SAVERS_KEY = 'wall-tones-savers';
const PLAY_LEVEL_KEY = 'wall-tones-play-level';
const INDEX_OWNED_KEY = 'wall-tones-index-owned';
const SKIP_PATTERN_OWNED_KEY = 'wall-tones-skip-pattern-owned';
const SPEED_LEVEL_KEY = 'wall-tones-speed-level';
const SPEED_DISABLED_KEY = 'wall-tones-speed-disabled';
const SPEED_SELECTED_KEY = 'wall-tones-speed-selected';
const MULTIPLIER_LEVEL_KEY = 'wall-tones-multiplier-level';
const MULTIPLIER_DISABLED_KEY = 'wall-tones-multiplier-disabled';

// Skill-tree store prices (owner-approved 2026-11-11 as starting balance for
// testing, not final). Hint: 25/50/100 Bars then doubling. Open-ended by
// design: no level cap.
export const HINT_BASE_COSTS: readonly number[] = [25, 50, 100];
export const HINT_COST_GROWTH = 2;
/** Your Turn hint reveals this many pattern boxes per owned level. */
export const HINT_BOXES_PER_LEVEL = 5;

/** Listen (owner rule): without it there is no Listen-phase reveal row; with
 * it the row shows during Listen playback but adds no Your Turn hint help.
 * One-time purchase. */
export const LISTEN_COST = 30;

/** Autoplay (owner-approved test values): each level auto-plays the first
 * level*5 notes of the pattern during Your Turn. Prices 12/30/65/130 Bars,
 * then doubling. Unlocks once Hint reaches level 4 (owner gate 2026-11-11). */
// Provisional test value (Oded 2026-11-12 11:49: "or maybe no. like 250. we'll
// balance it later." - supersedes his 500 a minute earlier; balancing comes after
// testing, so later levels keep the existing doubling for now).
// Temporary repricing (Oded 2026-11-15 23:44 "Can you make auto play cost 2000
// for now ?", settled 23:51 after his 23:49 "just the first level or maybe ...
// 2500" and a follow-up ladder readout: asked to confirm 2500/5000/10000/20000
// he replied "What you just said is correct with the order, not the thing you
// heard by mistake."): the ladder base drops 5000 -> 2500 and keeps doubling.
export const AUTOPLAY_BASE_COSTS: readonly number[] = [2500];
export const AUTOPLAY_COST_GROWTH = 2;
export const AUTOPLAY_NOTES_PER_LEVEL = 5;
/** Gate chain (owner voice 2026-11-13): Hint L4 unlocks Play L1; Play L4
 * unlocks Autoplay; Hint levels keep increasing independently. */
export const PLAY_UNLOCK_HINT_LEVEL = 4;
/** Autoplay unlocks at Play level 4 (= PLAY_MAX_LEVEL, declared below). */
export const AUTOPLAY_UNLOCK_PLAY_LEVEL = 4;

/** Play (owner request 2026-11-12, backlog 66, verbatim): "another modifier
 * called "Play" and then after 4 levels it will enable autoplay. Each level
 * of play will play 5 tones for you when you press a button in the game
 * menu." Four levels, five tones per level. Whether level 4 REPLACES the
 * Hint L4 Autoplay gate or joins it as a second path is the owner's pending
 * decision (asked 2026-11-12 11:42, unanswered; re-asked 2026-11-13), so
 * autoplayUnlocked() stays unchanged until then.
 * TEST PRICES (owner approved 2026-11-14 ~10:00, "Yeah we can do with them
 * and balance later", replying to: Index 500 one-off, Play levels 1-4 at
 * 500 / 1,000 / 2,000 / 4,000). They are test values for the balance pass. */
export const PLAY_MAX_LEVEL = 4;
export const PLAY_TONES_PER_LEVEL = 5;
export const PLAY_PRICING_SET = true;
export const PLAY_COSTS: readonly number[] = [500, 1000, 2000, 4000];

/** Speed modifier (backlog 96, his proposal 2026-11-14 18:43, verbatim in
 * WALL_TONES_TODO.md): four levels; the beginning of the pattern plays faster
 * during the Listen playback, covering only the first N notes where N is the
 * higher of the Play/Autoplay note counts (capped at the pattern length). He
 * flagged both open points himself: the per-level curve ("maybe half ... i
 * don't know if it's too much") and the base price ("like in the thousands"),
 * so the values below are PROVISIONAL TEST VALUES for the preview, not
 * approved economy. No unlock prerequisite was specified, so it is ungated
 * for now like Replay/Saver ("no prerequisites for now", 2026-11-11) - his
 * call if it needs a gate. */
export const SPEED_MAX_LEVEL = 4;
/** Provisional ladder ("base price ... in the thousands"), doubling per
 * level until the balance pass settles it. */
export const SPEED_COSTS: readonly number[] = [1000, 2000, 4000, 8000];
/** Note-time divisor per owned level (his "maybe half ... in each level"
 * proposal: level 4 reaches 16x, his own flagged concern). */
export const SPEED_NOTE_TIME_DIVISOR = 2;
/** Multiplier modifier (backlog 97 + 70): X2 double score (his 2026-11-11
 * store request: "Multiplier modifier (where you get double score)"). Since
 * Total Score IS lifetime Bars earned, the multiplier scales the Bar awards
 * themselves. Levels X3/X4 sit above X2 (backlog 70, 2026-11-12 11:48):
 * their costs must grow "really high exponentially and not the regular
 * progression". He never supplied prices or a formula - the ladder below is
 * a PROPOSAL for his approval (x5 growth instead of the regular doubling),
 * not approved economy. Unsettled and flagged in the PR: unlock gate (none
 * for now, Replay/Saver precedent) and whether AutoPlay-credited rounds
 * also multiply (they do here). Achievement side is constrained by his
 * settled 2026-11-15 rule ("auto play shouldn't award achievements... saved
 * to the human player"): AutoPlay-earned Bars land in autoplayBarsTotal and
 * NEVER count toward Bars/Total Score achievements, multiplier or not -
 * that split already exists and this modifier does not weaken it. The one
 * achievement question left to him: doubled Bars from HUMAN rounds count
 * double toward lifetime Bars/Total Score (that IS "double score" here,
 * since Total Score == lifetime human-earned Bars). */
export const MULTIPLIER_MAX_LEVEL = 4;
/** Factor per owned level (1-based): X2 / X3 / X4 / X8. The fourth X8 tier
 * is his 2026-11-17 ask ("add level X8 maybe so we have 4 levels"). */
export const MULTIPLIER_FACTORS: readonly number[] = [2, 3, 4, 8];
/** Proposed ladder for his approval: X2 1,000 / X3 5,000 / X4 25,000 /
 * X8 125,000 (x5 growth per his "really high exponentially, not the regular
 * progression"; the X8 price is provisional like the rest). */
export const MULTIPLIER_COSTS: readonly number[] = [1000, 5000, 25000, 125000];
/** Display/payout factor for a Multiplier level. Level 0 (unowned) maps to
 * the first tier's X2 so labels name what buying first gives. */
export function multiplierFactorForLevel(level: number): number {
  return MULTIPLIER_FACTORS[Math.min(Math.max(Math.floor(level), 1), MULTIPLIER_MAX_LEVEL) - 1]!;
}

/** Index pointer (owner 2026-11-12: "same row as play, unlocking after hint
 * level 3"; added to this PR by his 2026-11-13 ask). An indicator for where
 * the player is in the pattern; its exact display/behavior is still to
 * confirm with him, so this PR ships the gated tile and the purchase only.
 * One-off test price 500 (owner approved 2026-11-14, balance later). */
export const INDEX_UNLOCK_HINT_LEVEL = 3;
export const INDEX_PRICING_SET = true;
export const INDEX_COST = 500;

/** Skip Pattern (owner WhatsApp 2026-11-15 23:48 and 2026-11-18 11:44, 12:58,
 * 12:59): after the player owns Play, a one-off unlock adds a manual button,
 * pressed each demonstration, that cuts the tone demonstration short (the
 * Listen part before the player's turn). It never skips the player's turn.
 * Initial unlock price 1000 Bars (his 2026-11-18 12:59 "it can cost 1000
 * initially"); balance later. */
export const SKIP_PATTERN_COST = 1000;

/** Replay (owner-approved 2026-11-11): a consumable re-hear of the current
 * pattern. Paid Replays cost 20 Bars, no purchase limit for now. Free Replays
 * are earned at every 5-note milestone beyond the current Hint coverage, are
 * kept in inventory after failure, and at most 2 free ones are held; a free
 * grant at the full cap is lost. Paid ones sit on top of the cap. */
export const REPLAY_PRICE_BARS = 20;
export const REPLAY_FREE_CAP = 2;
export const REPLAY_EARN_STEP = 5;

/** One-time Top Secret store item price (user-settled Nov 7): grants the
 * hidden Secret Revealed achievement and nothing else. */
export const TOP_SECRET_COST = 100000;

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
  // Backlog 30 research: combined MR movement estimate (headset + pad reach,
  // meter totals from movement.ts). Levels are placeholders until headset
  // testing settles the scoring (owner Nov 11).
  { id: 'movement', label: 'Movement', description: 'Meters moved in MR: headset movement plus pad reach (research, provisional levels).', levels: [10, 25, 50] },
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

/** Selected Speed strength for the cycle control (his 2026-11-17 ask: the
 * panel button cycles the bought speeds, off at the end of the cycle).
 * Migrates the retired on/off flag: with no stored selection, an owned
 * Speed starts at full strength unless it was switched off. */
function readSpeedSelected(): number {
  try {
    const raw = globalThis.localStorage?.getItem(SPEED_SELECTED_KEY);
    if (raw != null) {
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }
    return readNumber(SPEED_DISABLED_KEY) === 1 ? 0 : readNumber(SPEED_LEVEL_KEY);
  } catch {
    return 0;
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
 * the economy and progression own, plus the Cypher storyline and the heard AutoPlay
 * phrases. Settings/accessibility prefs survive.
 * Callers reload the page afterwards so in-memory state re-reads cleanly. */
export function resetWallTonesStats(): void {
for (const key of [
BARS_KEY,
BARS_TOTAL_KEY,
AUTOPLAY_BARS_TOTAL_KEY,
HINT_LEVEL_KEY,
ACHIEVEMENTS_KEY,
FIRST_FLAGS_KEY,
BEST_STREAK_KEY,
PURCHASES_KEY,
PRESSES_KEY,
TOP_SECRET_KEY,
LISTEN_KEY,
AUTOPLAY_LEVEL_KEY,
AUTOPLAY_DISABLED_KEY,
REPLAY_FREE_KEY,
REPLAY_PAID_KEY,
SAVERS_KEY,
PLAY_LEVEL_KEY,
INDEX_OWNED_KEY,
SKIP_PATTERN_OWNED_KEY,
SPEED_LEVEL_KEY,
SPEED_DISABLED_KEY,
SPEED_SELECTED_KEY,
MULTIPLIER_LEVEL_KEY,
MULTIPLIER_DISABLED_KEY,
// Backlog 30 research totals (fractional meters; economy's number helpers
// do not own them).
...MOVEMENT_STORAGE_KEYS,
CYPHER_PROGRESS_KEY,
BACKGROUND_PROGRESS_KEY,
// Owned by autoplay-cue.ts (AUTOPLAY_PHRASES_HEARD_KEY); duplicated as a
// literal because the unit tests import this module standalone.
'wall-tones-autoplay-phrases-heard-v1',
'wall-tones-instructions-v1',
'wall-tones-return-visit-v1',
'wall-tones-achievements-intro-played',
]) {
try { globalThis.localStorage?.removeItem(key); } catch { /* private mode */ }
}
}

export class WallTonesEconomy {
  private bars = readNumber(BARS_KEY);
  private barsTotal = readNumber(BARS_TOTAL_KEY);
  /** Lifetime Bars AutoPlay earned (spendable, but never human progress). */
  private autoplayBarsTotal = readNumber(AUTOPLAY_BARS_TOTAL_KEY);
  private hintLevel = readNumber(HINT_LEVEL_KEY);
  private unlocked = new Set(readStringArray(ACHIEVEMENTS_KEY));
  private firstFlags = new Set(readStringArray(FIRST_FLAGS_KEY));
  private purchases = readNumber(PURCHASES_KEY);
  private presses = readNumber(PRESSES_KEY);
  private topSecretOwned = readNumber(TOP_SECRET_KEY) === 1;
  private listenOwned = readNumber(LISTEN_KEY) === 1;
  private autoplayLevel = readNumber(AUTOPLAY_LEVEL_KEY);
  private autoplayDisabled = readNumber(AUTOPLAY_DISABLED_KEY) === 1;
  private replaysFree = readNumber(REPLAY_FREE_KEY);
  private replaysPaid = readNumber(REPLAY_PAID_KEY);
  private savers = readNumber(SAVERS_KEY);
  private playLevel = readNumber(PLAY_LEVEL_KEY);
  private indexOwned = readNumber(INDEX_OWNED_KEY) === 1;
  private skipPatternOwned = readNumber(SKIP_PATTERN_OWNED_KEY) === 1;
  private speedLevel = readNumber(SPEED_LEVEL_KEY);
  private speedSelected = readSpeedSelected();
  private multiplierLevel = readNumber(MULTIPLIER_LEVEL_KEY);
  private multiplierDisabled = readNumber(MULTIPLIER_DISABLED_KEY) === 1;
  /** In-memory test Bars from the ?demoBars URL flag. Never persisted, never
   * counted in lifetime totals, and always spent before real Bars so the
   * saved balance stays untouched (owner-approved preview aid 2026-11-11). */
  private demoBoost = 0;
  /** Latest unlocks since the last drain, for a visual panel toast. */
  private pendingToasts: AchievementDef[] = [];

  getBars(): number {
    return this.bars + this.demoBoost;
  }

  /** Test-only Bars currently granted by the ?demoBars flag (not saved). */
  getDemoBoost(): number {
    return this.demoBoost;
  }

  /** Preview/test aid: grant spendable Bars in memory only. */
  applyDemoBoost(amount: number): void {
    if (amount > 0) this.demoBoost += Math.floor(amount);
  }

  /** Deduct a purchase: demo boost first, then the persisted balance. */
  private spend(cost: number): boolean {
    if (this.getBars() < cost) return false;
    let remaining = cost;
    const fromBoost = Math.min(this.demoBoost, remaining);
    this.demoBoost -= fromBoost;
    remaining -= fromBoost;
    if (remaining > 0) {
      this.bars -= remaining;
      writeNumber(BARS_KEY, this.bars);
    }
    return true;
  }

  private countPurchase(): void {
    this.purchases += 1;
    writeNumber(PURCHASES_KEY, this.purchases);
    this.checkAchievements(0);
  }

  getBarsTotal(): number {
    return this.barsTotal;
  }

  /** Lifetime Bars AutoPlay earned: spendable but never human achievement
   * progress (owner rule 2026-11-15). Exposed for the debug bridge/tests. */
  getAutoplayBarsTotal(): number {
    return this.autoplayBarsTotal;
  }

  /** Streak savers in stock (test-value consumable, see consumable-values). */
  getSavers(): number {
    return this.savers;
  }

  /** Buy one saver for `price` Bars. Never partial. Uses spend() so
   * ?demoBars test funds deduct before the persisted balance, matching
   * every other store purchase and the Store/Game Over affordance that
   * reads getBars(). */
  buySaver(price: number): boolean {
    if (!this.spend(price)) return false;
    this.savers += 1;
    writeNumber(SAVERS_KEY, this.savers);
    this.countPurchase();
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

  /** Pattern boxes revealed during Your Turn at the owned hint level. Gated on
   * Listen ownership (bug report 2026-11-12): legacy saves from the pre-Listen
   * store carry hint levels onto this origin; without the gate they keep
   * revealing hints. Non-destructive - the levels stay, they just do not act. */
  getHintRevealCount(): number {
    return this.listenOwned ? this.hintLevel * HINT_BOXES_PER_LEVEL : 0;
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
   * summary breakdown. `achievementStreak` is the streak the achievement
   * check may credit: the live streak for a human-completed round, the
   * saved human best for an AutoPlay-completed round (owner rule
   * 2026-11-15: AutoPlay never advances streak achievements).
   * `creditHuman` false (AutoPlay-completed round) pays the completion Bars
   * to the spendable balance but keeps them out of the human lifetime
   * counters, so Bars/Total Score achievements never unlock from AutoPlay. */
  completePattern(
    streak: number,
    recordBeaten: boolean,
    achievementStreak: number = streak,
    creditHuman: boolean = true,
  ): { completion: number; bonus: number } {
    const completion = this.award(barsForStreak(streak), streak, achievementStreak, creditHuman);
    const bonus = recordBeaten
      ? this.award(barsForStreak(streak) * streak, streak, achievementStreak, creditHuman)
      : 0;
    return { completion, bonus };
  }

  private award(amount: number, streak: number, achievementStreak?: number, countAsEarned = true): number {
    if (amount <= 0) return 0;
    // Multiplier (backlog 97): every Bar award scales by the owned factor
    // while enabled. FLAGGED for him: AutoPlay-credited awards
    // (countAsEarned false) multiply too - unsettled. AutoPlay-multiplied
    // Bars still land in autoplayBarsTotal, so they can never unlock human
    // achievements (his 2026-11-15 rule); only the autoplay-multiply choice
    // itself is provisional.
    amount *= this.getMultiplierFactor();
    // Open-rift encounter penalty (owner-settled Nov 18: score AND Bars carry
    // one x0.5 while a portal is open; energy earning is unaffected). The
    // provider is injected by WallTonesSystem so the economy stays game-agnostic.
    amount *= this.scoreFactorProvider?.() ?? 1;
    this.bars += amount;
    if (countAsEarned) {
      this.barsTotal += amount;
      writeNumber(BARS_TOTAL_KEY, this.barsTotal);
    } else {
      this.autoplayBarsTotal += amount;
      writeNumber(AUTOPLAY_BARS_TOTAL_KEY, this.autoplayBarsTotal);
    }
    writeNumber(BARS_KEY, this.bars);
    this.checkAchievements(achievementStreak ?? streak);
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
        // AutoPlay earnings are tracked apart and never count here (owner
        // rule 2026-11-15: AutoPlay does not earn human achievements).
        return this.barsTotal;
      case 'store':
        return this.purchases;
      case 'presses':
        return this.presses;
      case 'movement':
        // Backlog 30 research: owned by movement.ts storage, not a counter here.
        return readLifetimeMovementMeters();
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

  /** Listen store item (owner gate: Listen unlocks Hint level 1). */
  ownsListen(): boolean {
    return this.listenOwned;
  }

  /** Buy the one-time Listen item. Returns true when the purchase landed. */
  buyListen(): boolean {
    if (this.listenOwned || !this.spend(LISTEN_COST)) return false;
    this.listenOwned = true;
    writeNumber(LISTEN_KEY, 1);
    this.countPurchase();
    return true;
  }

  /** Skill-tree gate: Hint level 1 requires owning Listen (owner 2026-11-11). */
  hintUnlocked(): boolean {
    return this.listenOwned;
  }

  /** Skill-tree gate: Autoplay unlocks at Play level 4 (owner voice
   * 2026-11-13). Listen ownership required too (bug report 2026-11-12):
   * legacy saves could carry levels without Listen. */
  autoplayUnlocked(): boolean {
    return this.listenOwned && this.playLevel >= AUTOPLAY_UNLOCK_PLAY_LEVEL;
  }

  /** Buy the next hint level. Returns true when the purchase landed. */
  buyNextHintLevel(): boolean {
    if (!this.hintUnlocked()) return false;
    const cost = this.hintCost(this.hintLevel + 1);
    if (!this.spend(cost)) return false;
    this.hintLevel += 1;
    writeNumber(HINT_LEVEL_KEY, this.hintLevel);
    this.countPurchase();
    return true;
  }

  /** Owned Autoplay level (0 = not owned). */
  getAutoplayLevel(): number {
    return this.autoplayLevel;
  }

  /** Notes Autoplay plays for the player at the owned level. */
  getAutoplayNoteCount(): number {
    return this.autoplayLevel * AUTOPLAY_NOTES_PER_LEVEL;
  }

  /** AutoPlay fires on rounds only while owned AND switched on (owner
   * 2026-11-15: the player can enable/disable it). Owning keeps it on
   * until the player switches it off. */
  isAutoplayEnabled(): boolean {
    return this.autoplayLevel > 0 && !this.autoplayDisabled;
  }

  /** Switch AutoPlay on/off. No-op below ownership. */
  setAutoplayDisabled(disabled: boolean): void {
    this.autoplayDisabled = disabled;
    writeNumber(AUTOPLAY_DISABLED_KEY, disabled ? 1 : 0);
  }

  /** Cost of buying Autoplay level `level` (1-based). Open-ended doubling. */
  autoplayCost(level: number): number {
    if (level <= AUTOPLAY_BASE_COSTS.length) return AUTOPLAY_BASE_COSTS[Math.max(level, 1) - 1]!;
    let cost = AUTOPLAY_BASE_COSTS[AUTOPLAY_BASE_COSTS.length - 1]!;
    for (let i = AUTOPLAY_BASE_COSTS.length; i < level; i++) {
      cost = cost * AUTOPLAY_COST_GROWTH;
    }
    return cost;
  }

  /** Buy the next Autoplay level. Returns true when the purchase landed. */
  buyNextAutoplayLevel(): boolean {
    if (!this.autoplayUnlocked()) return false;
    const cost = this.autoplayCost(this.autoplayLevel + 1);
    if (!this.spend(cost)) return false;
    this.autoplayLevel += 1;
    writeNumber(AUTOPLAY_LEVEL_KEY, this.autoplayLevel);
    this.countPurchase();
    return true;
  }

  /** Owned Play level (0 = not owned). */
  getPlayLevel(): number {
    return this.playLevel;
  }

  /** Tones Play plays for the player at the owned level (5 per level). */
  getPlayNoteCount(): number {
    return this.playLevel * PLAY_TONES_PER_LEVEL;
  }

  /** Cost of Play level `level` (1-based), once prices are set. */
  playCost(level: number): number {
    return PLAY_COSTS[Math.min(Math.max(level, 1), PLAY_MAX_LEVEL) - 1]!;
  }

  /** Play unlocks at Hint level 4 (owner voice 2026-11-13: only then can
   * Play level one be opened). Listen ownership required too. */
  playUnlocked(): boolean {
    return this.listenOwned && this.hintLevel >= PLAY_UNLOCK_HINT_LEVEL;
  }

  /** Buy the next Play level. REFUSES while locked, and while
   * PLAY_PRICING_SET is false; four levels max. */
  buyNextPlayLevel(): boolean {
    if (!this.playUnlocked()) return false;
    if (!PLAY_PRICING_SET) return false;
    if (this.playLevel >= PLAY_MAX_LEVEL) return false;
    const cost = this.playCost(this.playLevel + 1);
    if (!this.spend(cost)) return false;
    this.playLevel += 1;
    writeNumber(PLAY_LEVEL_KEY, this.playLevel);
    this.countPurchase();
    return true;
  }

  /** Test-only: seed the Play level without a purchase. */
  debugGrantPlayLevel(level: number): void {
    this.playLevel = Math.min(Math.max(Math.floor(level), 0), PLAY_MAX_LEVEL);
    writeNumber(PLAY_LEVEL_KEY, this.playLevel);
  }

  /** Test-only: grant Skip Pattern without a purchase. */
  debugGrantSkipPattern(): void {
    this.skipPatternOwned = true;
    writeNumber(SKIP_PATTERN_OWNED_KEY, 1);
  }

  /** Test-only: grant the Index pointer without a purchase. */
  debugGrantIndex(): void {
    this.indexOwned = true;
    writeNumber(INDEX_OWNED_KEY, 1);
  }

  /** Owned Speed level (0 = not owned). */
  getSpeedLevel(): number {
    return this.speedLevel;
  }

  /** Speed applies while owned AND a strength is selected (the panel
   * button cycles the bought speeds with off at the end of the cycle, his
   * 2026-11-17 ask). */
  isSpeedEnabled(): boolean {
    return this.speedLevel > 0 && this.getSpeedSelectedLevel() > 0;
  }

  /** Selected Speed strength, clamped to ownership: 0 = off. */
  getSpeedSelectedLevel(): number {
    return Math.min(this.speedSelected, this.speedLevel);
  }

  /** Cycle the selection 1 -> 2 -> ... -> owned -> off -> 1. Returns the
   * new selection (0 = off). No-op below ownership. */
  cycleSpeedSelection(): number {
    if (this.speedLevel < 1) return 0;
    const current = this.getSpeedSelectedLevel();
    const next = current >= this.speedLevel ? 0 : current + 1;
    this.speedSelected = next;
    writeNumber(SPEED_SELECTED_KEY, next);
    return next;
  }

  /** Cost of Speed level `level` (1-based). Provisional test prices. */
  speedCost(level: number): number {
    return SPEED_COSTS[Math.min(Math.max(level, 1), SPEED_MAX_LEVEL) - 1]!;
  }

  /** Note-time multiplier for covered notes: 1/2^selected on his "half
   * each level" proposal; 1 (normal time) while off. */
  speedNoteTimeFactor(): number {
    if (!this.isSpeedEnabled()) return 1;
    return 1 / SPEED_NOTE_TIME_DIVISOR ** this.getSpeedSelectedLevel();
  }

  /** Listen-playback notes Speed covers at the current Play/Autoplay
   * ownership (his rule: the higher of the two note counts). Without Play
   * or Autoplay this is 0 and Speed has no effect - flagged for him. */
  speedCoveredNoteCount(): number {
    return Math.max(this.getPlayNoteCount(), this.getAutoplayNoteCount());
  }

  /** Buy the next Speed level. Four levels max; provisional prices, no
   * unlock gate for now (see the constants block). */
  buyNextSpeedLevel(): boolean {
    if (this.speedLevel >= SPEED_MAX_LEVEL) return false;
    const cost = this.speedCost(this.speedLevel + 1);
    if (!this.spend(cost)) return false;
    this.speedLevel += 1;
    writeNumber(SPEED_LEVEL_KEY, this.speedLevel);
    // Owning (or upgrading) selects the new full strength.
    this.speedSelected = this.speedLevel;
    writeNumber(SPEED_SELECTED_KEY, this.speedSelected);
    this.countPurchase();
    return true;
  }

  /** Owned Multiplier level (0 = not owned; 1 = X2, 2 = X3, 3 = X4, 4 = X8). */
  getMultiplierLevel(): number {
    return this.multiplierLevel;
  }

  /** Score/Bars factor at the owned level (the X2/X3/X4/X8 ladder); 1
   * while not enabled. */
  private scoreFactorProvider: (() => number) | null = null;

  /** External score/Bars factor hook (the rift encounter's open-portal
   * penalty). Applied inside award() so press, completion and record awards
   * all carry the single settled factor. */
  setScoreFactorProvider(provider: (() => number) | null): void {
    this.scoreFactorProvider = provider;
  }

  getMultiplierFactor(): number {
    if (!this.isMultiplierEnabled()) return 1;
    return multiplierFactorForLevel(this.multiplierLevel);
  }

  /** Multiplier applies while owned AND switched on (the enable/disable
   * toggle mirrors the settled AutoPlay pattern; owning keeps it on). */
  isMultiplierEnabled(): boolean {
    return this.multiplierLevel > 0 && !this.multiplierDisabled;
  }

  /** Switch the Multiplier on/off. No-op below ownership. */
  setMultiplierDisabled(disabled: boolean): void {
    this.multiplierDisabled = disabled;
    writeNumber(MULTIPLIER_DISABLED_KEY, disabled ? 1 : 0);
  }

  /** Cost of Multiplier level `level` (1-based). PROPOSED prices, his to
   * approve (backlog 70). */
  multiplierCost(level: number): number {
    return MULTIPLIER_COSTS[Math.min(Math.max(level, 1), MULTIPLIER_MAX_LEVEL) - 1]!;
  }

  /** Buy the next Multiplier level. Four levels max (X2/X3/X4/X8); proposed
   * prices, no unlock gate for now (see the constants block). */
  buyNextMultiplierLevel(): boolean {
    if (this.multiplierLevel >= MULTIPLIER_MAX_LEVEL) return false;
    const cost = this.multiplierCost(this.multiplierLevel + 1);
    if (!this.spend(cost)) return false;
    this.multiplierLevel += 1;
    writeNumber(MULTIPLIER_LEVEL_KEY, this.multiplierLevel);
    this.countPurchase();
    return true;
  }

  /** Test-only: seed the Speed level without a purchase. */
  debugGrantSpeedLevel(level: number): void {
    this.speedLevel = Math.min(Math.max(Math.floor(level), 0), SPEED_MAX_LEVEL);
    this.speedSelected = this.speedLevel;
    writeNumber(SPEED_SELECTED_KEY, this.speedSelected);
    writeNumber(SPEED_LEVEL_KEY, this.speedLevel);
  }

  /** Test-only: seed the Multiplier level without a purchase. */
  debugGrantMultiplierLevel(level: number): void {
    this.multiplierLevel = Math.min(Math.max(Math.floor(level), 0), MULTIPLIER_MAX_LEVEL);
    writeNumber(MULTIPLIER_LEVEL_KEY, this.multiplierLevel);
  }

  /** Index pointer owned (one-time item). */
  ownsIndex(): boolean {
    return this.indexOwned;
  }

  /** Skill-tree gate: Index unlocks at Hint level 3 (owner 2026-11-12).
   * Listen ownership required too, same legacy-save lesson as Autoplay. */
  indexUnlocked(): boolean {
    return this.listenOwned && this.hintLevel >= INDEX_UNLOCK_HINT_LEVEL;
  }

  /** Buy the Index pointer: one-off, needs Hint level 3, test price 500. */
  buyIndex(): boolean {
    if (!INDEX_PRICING_SET || !this.indexUnlocked() || this.indexOwned) {
      return false;
    }
    if (!this.spend(INDEX_COST)) return false;
    this.indexOwned = true;
    writeNumber(INDEX_OWNED_KEY, 1);
    this.countPurchase();
    return true;
  }

  /** Skip Pattern owned (one-time unlock). */
  ownsSkipPattern(): boolean {
    return this.skipPatternOwned;
  }

  /** Gate: available once the player has Play. */
  skipPatternUnlocked(): boolean {
    return this.playLevel >= 1;
  }

  /** Buy the Skip Pattern unlock: one-off, needs Play owned, 1000 Bars. */
  buySkipPattern(): boolean {
    if (!this.skipPatternUnlocked() || this.skipPatternOwned) {
      return false;
    }
    if (!this.spend(SKIP_PATTERN_COST)) return false;
    this.skipPatternOwned = true;
    writeNumber(SKIP_PATTERN_OWNED_KEY, 1);
    this.countPurchase();
    return true;
  }

  /** Free Replays held (cap REPLAY_FREE_CAP; paid ones sit on top). */
  getReplaysFree(): number {
    return this.replaysFree;
  }

  getReplaysPaid(): number {
    return this.replaysPaid;
  }

  getReplaysTotal(): number {
    return this.replaysFree + this.replaysPaid;
  }

  /** Buy a paid Replay (20 Bars, no purchase limit for now). */
  buyReplay(): boolean {
    if (!this.spend(REPLAY_PRICE_BARS)) return false;
    this.replaysPaid += 1;
    writeNumber(REPLAY_PAID_KEY, this.replaysPaid);
    this.countPurchase();
    return true;
  }

  /** Grant a free Replay; at the full free cap the grant is lost (owner
   * rule) and this returns false. */
  grantFreeReplay(): boolean {
    if (this.replaysFree >= REPLAY_FREE_CAP) return false;
    this.replaysFree += 1;
    writeNumber(REPLAY_FREE_KEY, this.replaysFree);
    return true;
  }

  /** True when completing a pattern of `length` notes hits an earn milestone:
   * every 5 notes beyond the current Hint coverage (owner rule 2026-11-11). */
  isReplayMilestone(length: number): boolean {
    const beyond = length - this.getHintRevealCount();
    return beyond >= REPLAY_EARN_STEP && beyond % REPLAY_EARN_STEP === 0;
  }

  /** Consume one Replay (free ones first). Returns false when none are held. */
  useReplay(): boolean {
    if (this.replaysFree > 0) {
      this.replaysFree -= 1;
      writeNumber(REPLAY_FREE_KEY, this.replaysFree);
      return true;
    }
    if (this.replaysPaid > 0) {
      this.replaysPaid -= 1;
      writeNumber(REPLAY_PAID_KEY, this.replaysPaid);
      return true;
    }
    return false;
  }

  /** Buy the one-time Top Secret item (user-settled Nov 7): 1000 Bars,
   * grants the hidden Secret Revealed achievement, no other reward. */
  buyTopSecret(): boolean {
    if (this.topSecretOwned || !this.spend(TOP_SECRET_COST)) return false;
    this.topSecretOwned = true;
    writeNumber(TOP_SECRET_KEY, 1);
    this.countPurchase();
    this.unlock('secret-1', 'Secret Revealed', 'A secret. It stays secret.');
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

  /** Movement totals change in movement.ts outside the economy's own
   * counters; re-run the threshold check when the tracker reports a new
   * whole meter so Movement achievements unlock during play (backlog 30). */
  noteExternalProgress(liveStreak: number): void {
    this.checkAchievements(liveStreak);
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
