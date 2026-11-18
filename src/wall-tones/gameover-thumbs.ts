/**
 * Game Over thumbs gestures (owner, Nov 17): while the Game Over popup is
 * open in MR with hand tracking, the player can answer with their thumbs
 * instead of the panel buttons.
 *
 * Owner-specified behavior (Nov 17, verbatim scope):
 * - Hold BOTH thumbs up together: spend owned savers and retry the same
 *   pattern (deliberate hold - the exact cost stays visible on the panel).
 * - Hold ONE thumb up: arms a confirmation. The second thumb up can be the
 *   other hand, or the same hand lowered and raised again.
 * - Thumb down in either state: start a new run without using savers.
 *
 * Gestures only ever spend OWNED savers (the same call the "Use savers"
 * button makes); buying savers with gold bars stays button-only. When the
 * retry is unaffordable the up gestures are inert (retryAvailable=false) and
 * thumb down still starts a new run.
 *
 * Pure state machine over per-hand poses, no imports, so the node test
 * loader can inline it (same rule as gesture-check.ts). The system layer
 * classifies poses with the thumbs lab's classifyThumbPose and feeds them
 * here once per frame.
 */

export type GameOverThumbPose = 'up' | 'down' | 'none';

export interface GameOverThumbsConfig {
  /** Both thumbs up together: direct retry hold (deliberate, seconds). */
  readonly holdBothSec: number;
  /** One thumb up: hold to arm the confirmation (seconds). */
  readonly holdArmSec: number;
  /** The second thumb up (either hand route): hold to confirm (seconds). */
  readonly holdConfirmSec: number;
  /** Thumb down: hold to start a new run (seconds). */
  readonly holdDownSec: number;
}

export const DEFAULT_GAMEOVER_THUMBS_CONFIG: GameOverThumbsConfig = {
  holdBothSec: 1.5,
  holdArmSec: 0.6,
  holdConfirmSec: 0.8,
  holdDownSec: 0.8,
};

export type GameOverThumbsEvent = 'armed' | 'retry' | 'new-run';

type Hand = 'left' | 'right';

/** True where a thumb answer is possible: immersive play with a
 * hand-tracking input source, while the Game Over popup is open (checked by
 * the caller). Flat/desktop players keep the buttons only. */
export function shouldRunGameOverThumbs(
  immersive: boolean,
  handTracking: boolean,
): boolean {
  return immersive && handTracking;
}

export class GameOverThumbsFlow {
  private enabled = false;
  private retryAvailable = true;
  private armed = false;
  private armedHand: Hand | null = null;
  /** Frame time each hand's current up-hold began; -1 = not holding up. */
  private readonly upSince: Record<Hand, number> = { left: -1, right: -1 };
  private readonly downSince: Record<Hand, number> = { left: -1, right: -1 };
  private bothSince = -1;
  /** After arming, the arming hand must release before its re-raise counts
   * as the confirming second thumb up. The other hand needs no release. */
  private readonly released: Record<Hand, boolean> = { left: false, right: false };

  constructor(
    private readonly config: GameOverThumbsConfig = DEFAULT_GAMEOVER_THUMBS_CONFIG,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** True while a single-thumb arm is waiting for the confirming second up. */
  get isArmed(): boolean {
    return this.armed;
  }

  /** When false the up gestures are inert (retry unaffordable); thumb down
   * still starts a new run. Read on every event, so a button purchase while
   * the popup is open re-enables the up routes on the next frame. */
  setRetryAvailable(available: boolean): void {
    this.retryAvailable = available;
  }

  reset(): void {
    this.armed = false;
    this.armedHand = null;
    this.upSince.left = -1;
    this.upSince.right = -1;
    this.downSince.left = -1;
    this.downSince.right = -1;
    this.bothSince = -1;
    this.released.left = false;
    this.released.right = false;
  }

  /** Feed one frame. Poses come from the lab classifier; 'none' also covers
   * an untracked hand. Returns at most one event; a terminal event
   * ('retry'/'new-run') self-disables like the lab detector. */
  feed(
    left: GameOverThumbPose,
    right: GameOverThumbPose,
    now: number,
  ): GameOverThumbsEvent | null {
    if (!this.enabled) {
      return null;
    }
    const poses: Record<Hand, GameOverThumbPose> = { left, right };

    // Thumb down wins in either state: hold -> new run without savers.
    for (const hand of ['left', 'right'] as const) {
      if (poses[hand] === 'down') {
        if (this.downSince[hand] < 0) this.downSince[hand] = now;
        if (now - this.downSince[hand] >= this.config.holdDownSec) {
          return this.finish('new-run');
        }
      } else {
        this.downSince[hand] = -1;
      }
    }

    // Track up-holds and releases every frame (even while unaffordable, so a
    // pose that began before affordability returned does not count as held).
    for (const hand of ['left', 'right'] as const) {
      if (poses[hand] === 'up') {
        if (this.upSince[hand] < 0) this.upSince[hand] = now;
      } else {
        this.upSince[hand] = -1;
        if (this.armed) this.released[hand] = true;
      }
    }

    if (!this.retryAvailable) {
      this.bothSince = -1;
      return null;
    }

    const leftUp = this.upSince.left >= 0;
    const rightUp = this.upSince.right >= 0;

    // Both thumbs up together: the deliberate direct retry.
    if (leftUp && rightUp) {
      if (this.bothSince < 0) this.bothSince = now;
      if (now - this.bothSince >= this.config.holdBothSec) {
        return this.finish('retry');
      }
    } else {
      this.bothSince = -1;
    }

    if (!this.armed) {
      // Exactly one thumb up held: arm the confirmation.
      for (const hand of ['left', 'right'] as const) {
        const other: Hand = hand === 'left' ? 'right' : 'left';
        if (
          this.upSince[hand] >= 0 &&
          this.upSince[other] < 0 &&
          now - this.upSince[hand] >= this.config.holdArmSec
        ) {
          this.armed = true;
          this.armedHand = hand;
          this.released.left = false;
          this.released.right = false;
          return 'armed';
        }
      }
      return null;
    }

    // Armed: the second thumb up confirms. The other hand simply holds up;
    // the arming hand must have released first, then re-raised.
    for (const hand of ['left', 'right'] as const) {
      if (this.upSince[hand] < 0) continue;
      if (now - this.upSince[hand] < this.config.holdConfirmSec) continue;
      if (hand === this.armedHand && !this.released[hand]) continue;
      return this.finish('retry');
    }
    return null;
  }

  private finish(event: GameOverThumbsEvent): GameOverThumbsEvent {
    this.setEnabled(false);
    return event;
  }
}

/** Tracks stretches of frames with no tracked hand while the Game Over
 * popup is open (Quest auto-switches hand sources off while controllers are
 * active, so tracking comes and goes mid-popup). A short no-hand stretch
 * pauses the gesture flow; once the stretch reaches resetAfterSec the
 * caller restarts the gesture.
 *
 * True pause: holds measure OBSERVED time only. The caller feeds the flow
 * observedNow() instead of wall time, so seconds with no tracked hand never
 * count toward a hold - a thumb the flow cannot see is not a thumb held up,
 * and a deliberate hold cannot complete during a tracking gap. */
export class GameOverHandGapTracker {
  private noHandsSince = -1;
  /** True once the current stretch crossed the threshold (gesture restarted). */
  private stretchReset = false;
  /** Total wall seconds skipped while untracked since the last restart. */
  private pausedTotal = 0;

  constructor(private readonly resetAfterSec: number) {}

  /** One frame. Returns null when a hand is tracked (feed the flow with
   * observedNow(now)), 'pause' during a short no-hand stretch (skip the
   * frame), or 'reset' once the stretch reaches the threshold (restart the
   * gesture; idempotent while the stretch continues). */
  note(handsTracked: boolean, now: number): 'pause' | 'reset' | null {
    if (handsTracked) {
      if (this.noHandsSince >= 0 && !this.stretchReset) {
        this.pausedTotal += now - this.noHandsSince;
      }
      this.noHandsSince = -1;
      this.stretchReset = false;
      return null;
    }
    if (this.noHandsSince < 0) {
      this.noHandsSince = now;
      this.stretchReset = false;
      return 'pause';
    }
    if (!this.stretchReset && now - this.noHandsSince >= this.resetAfterSec) {
      this.stretchReset = true;
      // The gesture restarts: drop the paused-time bookkeeping so the next
      // fed frame starts holds fresh from wall time.
      this.pausedTotal = 0;
      return 'reset';
    }
    return this.stretchReset ? 'reset' : 'pause';
  }

  /** Observed time for the flow's feed(): wall time minus the seconds spent
   * untracked since the last restart, so a hold freezes while no hand is
   * visible and resumes where it paused. */
  observedNow(now: number): number {
    return now - this.pausedTotal;
  }

  /** Length of the current no-hand stretch in wall seconds; 0 while tracked. */
  gapSec(now: number): number {
    return this.noHandsSince < 0 ? 0 : Math.max(0, now - this.noHandsSince);
  }

  /** Forget the current stretch and bookkeeping (popup open/close, world
   * swap). */
  reset(): void {
    this.noHandsSince = -1;
    this.stretchReset = false;
    this.pausedTotal = 0;
  }
}
