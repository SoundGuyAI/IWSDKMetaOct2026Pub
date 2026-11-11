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
}

export const DEFAULT_HEAD_GESTURE_CONFIG: HeadGestureConfig = {
  activationRad: (8 * Math.PI) / 180,
  reversalRad: (6 * Math.PI) / 180,
  minPeakRad: (14 * Math.PI) / 180,
  windowSec: 1.4,
  axisDominanceRatio: 1.6,
  cooldownSec: 1.2,
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
  private recentExcursion = 0;

  constructor(private readonly config: HeadGestureConfig) {}

  reset(): void {
    this.direction = 0;
    this.extreme = 0;
    this.armedAt = -1;
    this.lastCommitted = null;
    this.recentExcursion = 0;
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
    if (this.direction === 0) {
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
      if (
        committed.amplitude >= this.config.minPeakRad &&
        withinWindow &&
        this.lastCommitted == null
      ) {
        completed = committed.amplitude;
      }
      this.lastCommitted = committed;
      // Re-arm from the current angle so the return stroke does not
      // immediately register as a new opposite extreme.
      this.direction = 0;
      this.extreme = 0;
      this.armedAt = -1;
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
    private readonly config: HeadGestureConfig = DEFAULT_HEAD_GESTURE_CONFIG,
  ) {
    this.pitch = new AxisOscillationTracker(config);
    this.yaw = new AxisOscillationTracker(config);
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
