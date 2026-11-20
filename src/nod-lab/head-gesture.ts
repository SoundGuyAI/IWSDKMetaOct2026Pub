/**
 * Pure head-gesture oscillation detection for the nod yes/no research lab.
 *
 * No three.js or IWSDK imports: the system layer converts head orientation to
 * baseline-relative pitch/yaw angles and feeds numbers here, which keeps the
 * detector unit-testable in plain node.
 *
 * Model: an axis (pitch for nod, yaw for shake) registers extremes with
 * hysteresis. When the angle reverses from an extreme by at least
 * `reversalRad`, that extreme is committed. A committed extreme whose
 * amplitude reaches `minPeakRad` and whose full out-and-back completed inside
 * `windowSec` counts as one gesture cycle on that axis. The wrapper reports
 * the gesture only when the winning axis dominates the other axis's recent
 * excursion by `axisDominanceRatio`, then enforces `cooldownSec`.
 *
 * Known limits (documented in docs/NOD_LAB_RESEARCH.md): a fast deliberate
 * look down and back up inside the window can read as a nod. Thresholds are
 * starting values for headset tuning, not a claim of accuracy.
 */

export type YesNoAnswer = 'yes' | 'no';

export interface HeadGestureConfig {
  /** Displacement from baseline that arms the current extreme (radians). */
  readonly activationRad: number;
  /** Reversal distance from the armed extreme that commits it (radians). */
  readonly reversalRad: number;
  /** Minimum committed-extreme amplitude for a cycle (radians). */
  readonly minPeakRad: number;
  /** Longest allowed out-and-back duration for one cycle (seconds). */
  readonly windowSec: number;
  /** Winner axis excursion must exceed loser excursion by this factor. */
  readonly axisDominanceRatio: number;
  /** Quiet time after a reported gesture (seconds). */
  readonly cooldownSec: number;
  /**
   * When set, a committed extreme completes its cycle only once the angle
   * also returns within this distance of baseline (a true out-and-back).
   * Flat-mode pointer input uses this so a one-way drag toward a button
   * can never read as a gesture; the headset path leaves it null.
   */
  readonly returnToBaselineRad: number | null;
}

/**
 * Headset tuning, from the owner's Nov 16 Quest 3 recording-session capture:
 * the on-panel baseline-relative pitch during nods that FAILED to register
 * read 9-13.8 deg, while nods that registered read 15-19 deg - the old
 * 14 deg peak sat above most of the owner's real nods (14 answers in ~73s
 * of continuous trying). Activation/reversal/peak now match the flat-mode
 * values the owner's Nov 15 iPhone dataset produced (same person's nods);
 * dominance stays 1.6 (no headset evidence against it yet: the capture
 * cannot separate dominance rejects from peak rejects) and the anti-double
 * -count guard only blocks after a QUALIFYING commit (see tracker comment).
 */
export const DEFAULT_HEAD_GESTURE_CONFIG: HeadGestureConfig = {
  activationRad: (6 * Math.PI) / 180,
  reversalRad: (4 * Math.PI) / 180,
  minPeakRad: (10 * Math.PI) / 180,
  windowSec: 1.4,
  axisDominanceRatio: 1.6,
  cooldownSec: 1.2,
  returnToBaselineRad: null,
};

/**
 * Flat-mode (pointer drag + phone tilt) tuning, from the owner's Nov 15
 * iPhone screen recording: deliberate tilt nods peaked 10-22 deg of pitch
 * with 4-13 deg of yaw wobble, so the headset-tuned 14 deg peak and 1.6x
 * dominance made real nods nearly impossible. Activation/peak/reversal sit
 * lower and dominance relaxes to 1.25; the return-to-baseline guard still
 * blocks one-way pointer drags, and the wrap/flip absorption in
 * tilt-gesture.ts keeps sensor artifacts out of the samples.
 */
export const FLAT_HEAD_GESTURE_CONFIG: HeadGestureConfig = {
  ...DEFAULT_HEAD_GESTURE_CONFIG,
  activationRad: (6 * Math.PI) / 180,
  reversalRad: (4 * Math.PI) / 180,
  minPeakRad: (10 * Math.PI) / 180,
  // Flat mode needs a wider dominance gap than the headset: the owner's
  // Nov 15 iPhone recording shows real nods carry 10-12 deg yaw wobble
  // whose accumulated excursion beats pitch early in the trace, so 1.25
  // misreports the first cycle as 'no'. 2.0 rejects that wobble while
  // genuine shakes (yaw-dominant by a wide margin) still pass.
  axisDominanceRatio: 2.0,
  returnToBaselineRad: (6 * Math.PI) / 180,
};

/**
 * Flat-mode SENSITIVE preset (owner's Nov 16 ask: iPhone nods did not
 * register 100%). His Nov 15 iPhone dataset shows deliberate nods peaking
 * 10-22 deg, so the Standard 10 deg peak sits right at the low end: a
 * gentle nod armed (6 deg) and reversed (4 deg) but never qualified. This
 * preset lowers the qualification band (arm 5, reverse 3.5, peak 8) and
 * the return-to-baseline requirement to 5 deg. Dominance stays 2.0: the
 * Nov 15 trace shows relaxing it is what let yaw wobble misread a nod as
 * a shake, and no new evidence argues against it.
 */
export const FLAT_SENSITIVE_GESTURE_CONFIG: HeadGestureConfig = {
  ...FLAT_HEAD_GESTURE_CONFIG,
  activationRad: (5 * Math.PI) / 180,
  reversalRad: (3.5 * Math.PI) / 180,
  minPeakRad: (8 * Math.PI) / 180,
  returnToBaselineRad: (5 * Math.PI) / 180,
};

interface CommittedExtreme {
  readonly amplitude: number;
  readonly startedAt: number;
  readonly committedAt: number;
}

export class AxisOscillationTracker {
  private direction = 0;
  private extreme = 0;
  private armedAt = -1;
  private lastCommitted: CommittedExtreme | null = null;
  private pendingCycle: CommittedExtreme | null = null;
  private recentExcursion = 0;
  // After any commit, the angle must first come back within activation of
  // baseline before a new extreme can arm. Without this, the return stroke
  // of one slow movement re-arms at the held angle and its chained commit
  // reads as a fresh fast gesture (the "slow look down" case), while with
  // the old unconditional block a weak first stroke poisoned the real nod
  // behind it (the owner's Nov 16 Quest recording).
  private awaitingReturn = false;

  constructor(private config: HeadGestureConfig) {}

  /** Swap tuning live (owner's iPhone sensitivity selector); the swap
   * resets stroke state so no half-read gesture mixes two configs. */
  setConfig(config: HeadGestureConfig): void {
    this.config = config;
    this.reset();
  }

  reset(): void {
    this.direction = 0;
    this.extreme = 0;
    this.armedAt = -1;
    this.lastCommitted = null;
    this.pendingCycle = null;
    this.recentExcursion = 0;
    this.awaitingReturn = false;
  }

  /** Total absolute excursion seen within the gesture window. */
  get excursion(): number {
    return this.recentExcursion;
  }

  /**
   * Feed one baseline-relative angle sample. Returns the committed extreme
   * amplitude when a full gesture cycle just completed, otherwise null.
   */
  feed(angle: number, now: number): number | null {
    this.recentExcursion += Math.abs(angle);
    let completed: number | null = null;
    // A committed extreme awaiting the return stroke either completes here
    // (back near baseline, still inside the window) or expires.
    if (this.pendingCycle != null) {
      if (now - this.pendingCycle.startedAt > this.config.windowSec) {
        this.pendingCycle = null;
      } else if (
        Math.abs(angle) <= (this.config.returnToBaselineRad ?? 0)
      ) {
        completed = this.pendingCycle.amplitude;
        this.pendingCycle = null;
        return completed;
      }
    }
    if (this.direction === 0) {
      if (this.awaitingReturn) {
        if (Math.abs(angle) >= this.config.activationRad) {
          return null;
        }
        this.awaitingReturn = false;
      }
      if (Math.abs(angle) >= this.config.activationRad) {
        this.direction = Math.sign(angle);
        this.extreme = angle;
        this.armedAt = now;
      }
      return null;
    }
    const along = angle * this.direction;
    const extremeAlong = this.extreme * this.direction;
    if (along >= extremeAlong) {
      this.extreme = angle;
      return null;
    }
    if (extremeAlong - along >= this.config.reversalRad) {
      const committed: CommittedExtreme = {
        amplitude: Math.abs(this.extreme),
        startedAt: this.armedAt,
        committedAt: now,
      };
      const withinWindow =
        committed.committedAt - committed.startedAt <= this.config.windowSec;
      const qualifies =
        committed.amplitude >= this.config.minPeakRad && withinWindow;
      if (this.config.returnToBaselineRad == null) {
        // Headset path: anti-double-count guard, but only a QUALIFYING
        // commit blocks the next stroke. A sub-peak or expired commit that
        // also blocked would poison natural multi-stroke nodding: in the
        // owner's Nov 16 Quest recording a weak first stroke within the
        // window kept the real following nod from ever reporting (the same
        // failure the flat path's Nov 15 rework fixed there).
        if (qualifies && this.lastCommitted == null) {
          completed = committed.amplitude;
          this.lastCommitted = committed;
        }
      } else {
        // Flat path: a committed cycle completes when its return stroke
        // reaches baseline, so the only thing to guard is the awaiting
        // cycle itself - ignore new commits until it completes or
        // expires. The old lastCommitted guard blocked every later stroke
        // for a full window: in the owner's Nov 15 iPhone recording a
        // 13.4 deg first stroke and each following 22 deg nod poisoned
        // the next, so natural multi-stroke nodding never reported.
        if (qualifies && this.pendingCycle == null) {
          this.pendingCycle = committed;
        }
      }
      // Re-arm from the current angle so the return stroke does not
      // immediately register as a new opposite extreme; the angle must
      // first come back near baseline before the next extreme can arm.
      this.direction = 0;
      this.extreme = 0;
      this.armedAt = -1;
      this.awaitingReturn = true;
    }
    return completed;
  }

  /** Decay bookkeeping; call once per update tick. */
  tick(now: number): void {
    this.recentExcursion *= 0.9;
    if (
      this.lastCommitted != null &&
      now - this.lastCommitted.committedAt > this.config.windowSec
    ) {
      this.lastCommitted = null;
    }
    if (
      this.pendingCycle != null &&
      now - this.pendingCycle.startedAt > this.config.windowSec
    ) {
      this.pendingCycle = null;
    }
  }
}

export interface HeadGestureEvent {
  readonly answer: YesNoAnswer;
  readonly amplitudeRad: number;
  readonly at: number;
}

export class HeadNodShakeDetector {
  private readonly pitch: AxisOscillationTracker;
  private readonly yaw: AxisOscillationTracker;
  private lastEventAt = -Infinity;
  private enabled = false;

  constructor(
    private config: HeadGestureConfig = DEFAULT_HEAD_GESTURE_CONFIG,
  ) {
    this.pitch = new AxisOscillationTracker(config);
    this.yaw = new AxisOscillationTracker(config);
  }

  /** Swap tuning live (iPhone sensitivity selector on the lab panel). */
  setConfig(config: HeadGestureConfig): void {
    this.config = config;
    this.pitch.setConfig(config);
    this.yaw.setConfig(config);
  }

  /** Arming is controlled by the dialogue: detection only runs while a
   * prompt awaits an answer. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.pitch.reset();
    this.yaw.reset();
  }

  /** Feed one frame of baseline-relative head angles (radians). */
  feed(pitchRad: number, yawRad: number, now: number): HeadGestureEvent | null {
    this.pitch.tick(now);
    this.yaw.tick(now);
    if (!this.enabled) {
      return null;
    }
    const pitchCycle = this.pitch.feed(pitchRad, now);
    const yawCycle = this.yaw.feed(yawRad, now);
    const candidate: { answer: YesNoAnswer; amplitude: number } | null =
      pitchCycle != null
        ? { answer: 'yes', amplitude: pitchCycle }
        : yawCycle != null
          ? { answer: 'no', amplitude: yawCycle }
          : null;
    if (candidate == null) {
      return null;
    }
    if (now - this.lastEventAt < this.config.cooldownSec) {
      return null;
    }
    const winner =
      candidate.answer === 'yes' ? this.pitch.excursion : this.yaw.excursion;
    const loser =
      candidate.answer === 'yes' ? this.yaw.excursion : this.pitch.excursion;
    if (winner < loser * this.config.axisDominanceRatio) {
      return null;
    }
    this.lastEventAt = now;
    this.setEnabled(false);
    return { answer: candidate.answer, amplitudeRad: candidate.amplitude, at: now };
  }
}
