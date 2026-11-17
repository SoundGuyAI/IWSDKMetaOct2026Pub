/**
 * Flat-mode phone tilt gestures for the nod yes/no lab: tilting the phone
 * forward/back answers yes, left/right answers no.
 *
 * iOS 13+ Safari gates orientation data behind
 * DeviceOrientationEvent.requestPermission(), which must be called from a
 * user gesture; the lab asks once from its Start tap. A denial (or a
 * device without the API) is respected silently: the pointer-drag and
 * button paths keep working and nothing is tracked.
 *
 * Like the pointer path, this only converts sensor angles into
 * baseline-relative degrees and detection reuses HeadNodShakeDetector.
 * The listener samples only while a lab prompt is listening.
 */

import type { GestureAngleSample } from './pointer-gesture.js';

export type TiltPermission = 'granted' | 'denied' | 'unsupported' | 'unneeded';

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<string>;
}

/**
 * Ask for orientation access. Must be called from a user-gesture handler.
 * 'unneeded' means the platform exposes the API without a permission step.
 */
export async function requestTiltPermission(): Promise<TiltPermission> {
  if (typeof DeviceOrientationEvent === 'undefined') {
    return 'unsupported';
  }
  const withPermission =
    DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
  if (typeof withPermission.requestPermission === 'function') {
    try {
      const result = await withPermission.requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'unneeded';
}

/** Angular speed (deg per ~60 Hz event) below which the phone reads as
 * held still. A deliberate nod runs ~1 deg/event; hand settling runs well
 * under this, so stillness tracking never absorbs a real gesture. */
export const TILT_STILL_DEG_PER_EVENT = 0.17;
/**
 * Single-event jump no hand motion can produce (a deliberate gesture is
 * ~1 deg/event at ~60 Hz): a deviceorientation artifact, either a beta
 * wrap at +-180 or the iOS gamma reflection when the phone pitches past
 * vertical. Absorbed into the baseline in feed() instead of the sample.
 */
export const TILT_WRAP_JUMP_DEG = 45;
/**
 * Smaller gamma jump accepted as the iOS reflection only when beta crossed
 * +-90 in the same event (the reflection flips gamma's sign; at a shallow
 * roll the flip is smaller than TILT_WRAP_JUMP_DEG but still not real
 * motion at ~1 deg/event).
 */
export const TILT_FLIP_JUMP_DEG = 10;
/**
 * |beta| above which the phone is near or past vertical and iOS's gamma
 * reflection makes yaw untrusted: gamma flips sign as beta crosses +-90,
 * and the flip can arrive as a multi-event slide too gradual for
 * TILT_WRAP_JUMP_DEG / TILT_FLIP_JUMP_DEG to absorb. The owner's Nov 16
 * iPhone retest: a nod through vertical read yaw ~100-160 deg for seconds
 * and answered "no" at 81.7 deg. While beta is in this zone the tracker
 * snaps the gamma baseline to the current reading every event, freezing
 * yawDeg at 0; the flip (and the flip back) both happen inside the zone,
 * so yaw resumes cleanly when beta leaves it. Pitch (beta) stays
 * continuous through vertical, so nods keep working there.
 */
export const TILT_GIMBAL_ZONE_BETA_DEG = 80;
/** Still events before the baseline starts tracking the resting pose (~0.2 s). */
export const TILT_STILL_EVENTS_TO_TRACK = 12;
/** Per-event convergence toward the resting pose while still. */
export const TILT_REST_TRACK_ALPHA = 0.2;
/**
 * Rotate baseline-relative (pitch, yaw) into the screen's frame. The
 * tracker works on raw device axes (beta = device-x tilt, gamma = device-y
 * tilt), but the owner reads "tilt forward/back" relative to the SCREEN:
 * in landscape the nod axis is the device's gamma, not beta - without this
 * rotation a landscape nod fed the yaw (shake) axis and answered "no"
 * (the owner's Nov 16 iPhone report). Gestures are symmetric (forward OR
 * back both count), so only the axis assignment matters, not the sign.
 */
export function rotateToScreenFrame(
  pitchDeg: number,
  yawDeg: number,
  orientationAngleDeg: number,
): GestureAngleSample {
  const theta = (orientationAngleDeg * Math.PI) / 180;
  return {
    pitchDeg: pitchDeg * Math.cos(theta) + yawDeg * Math.sin(theta),
    yawDeg: -pitchDeg * Math.sin(theta) + yawDeg * Math.cos(theta),
  };
}

/**
 * Baseline-relative device orientation (beta = pitch, gamma = roll).
 *
 * The baseline is not frozen at arm time: a phone handed around or used
 * while cooking rarely sits at the same pose twice, and an anchor grabbed
 * mid-motion makes the detector's return-to-baseline requirement
 * unachievable (every later gesture expires undetected - the owner's
 * Nov 14 iPhone failure). While the phone is still the baseline tracks
 * the resting pose instead, so a gesture always reads as out-and-back
 * from where the phone actually rests. A committed cycle whose return
 * stroke was swallowed by the stale anchor then completes as the anchor
 * converges; the detector is deliberately not reset on anchor movement
 * (that reset is what killed those returns).
 */
export class TiltBaselineTracker {
  private baseBeta: number | null = null;
  private baseGamma: number | null = null;
  private lastBeta: number | null = null;
  private lastGamma: number | null = null;
  private stillEvents = 0;

  reset(): void {
    this.baseBeta = null;
    this.baseGamma = null;
    this.lastBeta = null;
    this.lastGamma = null;
    this.stillEvents = 0;
  }

  /** Null angles (desktop laptops, some browsers) produce no sample.
   * `orientationAngleDeg` is the screen orientation (0 portrait, 90/180/
   * 270); the baseline-relative result is rotated into the screen frame
   * so "forward/back" means the same gesture in portrait and landscape. */
  feed(
    betaDeg: number | null,
    gammaDeg: number | null,
    orientationAngleDeg = 0,
  ): GestureAngleSample | null {
    if (betaDeg == null || gammaDeg == null) {
      return null;
    }
    if (Math.abs(betaDeg) > TILT_GIMBAL_ZONE_BETA_DEG) {
      // Gimbal zone: gamma semantics are reflected/unstable (see
      // TILT_GIMBAL_ZONE_BETA_DEG). Freeze yaw by tracking the gamma
      // baseline 1:1; keep beta flowing so pitch nods still read.
      this.baseGamma = gammaDeg;
      if (this.baseBeta == null) {
        this.baseBeta = betaDeg;
        this.stillEvents = 0;
      } else if (this.lastBeta != null) {
        // Beta stays continuous and trusted through vertical, so the beta
        // baseline keeps tracking the resting pose here exactly like
        // outside the zone. Without it the anchor froze at the pre-zone
        // pose (or at a mid-motion grab after a baseline reset), pitching
        // every later sample by a constant offset and making the flat
        // detector's return-to-baseline requirement unachievable - the
        // owner's Nov 17 iPhone report: nods stopped registering after
        // moving the phone to point up, until it left the zone.
        const dBeta = betaDeg - this.lastBeta;
        if (Math.abs(dBeta) <= TILT_STILL_DEG_PER_EVENT) {
          this.stillEvents += 1;
          if (this.stillEvents >= TILT_STILL_EVENTS_TO_TRACK) {
            this.baseBeta +=
              (betaDeg - this.baseBeta) * TILT_REST_TRACK_ALPHA;
          }
        } else {
          this.stillEvents = 0;
        }
      }
      this.lastBeta = betaDeg;
      this.lastGamma = gammaDeg;
      // In the gimbal zone gamma is untrusted, so yaw is frozen BEFORE
      // the rotation: a landscape phone near vertical cannot read shakes
      // reliably (documented limit), nods keep working in portrait.
      return rotateToScreenFrame(
        betaDeg - this.baseBeta,
        0,
        orientationAngleDeg,
      );
    }
    if (this.baseBeta == null || this.baseGamma == null) {
      this.baseBeta = betaDeg;
      this.baseGamma = gammaDeg;
    } else if (this.lastBeta != null && this.lastGamma != null) {
      let dBeta = betaDeg - this.lastBeta;
      let dGamma = gammaDeg - this.lastGamma;
      // iOS reflects gamma when the phone pitches past vertical (beta
      // across +-90) and wraps beta at +-180; both arrive as single-event
      // jumps no hand motion can produce. If the jump reached the sample
      // it would read as a huge swing - the owner's Nov 14 iPhone run
      // answered "no" at 76 deg for a forward nod across vertical. Absorb
      // the artifact into the baseline so the sample stays continuous.
      const betaCrossedVertical =
        (this.lastBeta - 90) * (betaDeg - 90) < 0 ||
        (this.lastBeta + 90) * (betaDeg + 90) < 0;
      if (Math.abs(dBeta) > TILT_WRAP_JUMP_DEG) {
        this.baseBeta += dBeta;
        dBeta = 0;
      }
      if (
        Math.abs(dGamma) > TILT_WRAP_JUMP_DEG ||
        (betaCrossedVertical && Math.abs(dGamma) > TILT_FLIP_JUMP_DEG)
      ) {
        this.baseGamma += dGamma;
        dGamma = 0;
      }
      const speed = Math.hypot(dBeta, dGamma);
      if (speed <= TILT_STILL_DEG_PER_EVENT) {
        this.stillEvents += 1;
        if (this.stillEvents >= TILT_STILL_EVENTS_TO_TRACK) {
          this.baseBeta += (betaDeg - this.baseBeta) * TILT_REST_TRACK_ALPHA;
          this.baseGamma += (gammaDeg - this.baseGamma) * TILT_REST_TRACK_ALPHA;
        }
      } else {
        this.stillEvents = 0;
      }
    }
    this.lastBeta = betaDeg;
    this.lastGamma = gammaDeg;
    return rotateToScreenFrame(
      betaDeg - this.baseBeta,
      gammaDeg - this.baseGamma,
      orientationAngleDeg,
    );
  }
}

/**
 * Attach a deviceorientation feed. Events feed the tracker even while
 * `armed()` is false, so the resting-pose baseline already tracks the
 * phone when a prompt arms; samples are reported only while armed (a lab
 * prompt listening in flat mode), so orientation is never tracked for
 * answers outside the lab. Returns the detach function.
 */
export function attachTiltTracker(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  tracker: TiltBaselineTracker,
  armed: () => boolean,
  onSample: (sample: GestureAngleSample, nowSec: number) => void,
  getOrientationAngleDeg: () => number = () => 0,
): () => void {
  const onOrientation = (event: Event) => {
    const orientation = event as DeviceOrientationEvent;
    const sample = tracker.feed(
      orientation.beta,
      orientation.gamma,
      getOrientationAngleDeg(),
    );
    if (sample == null || !armed()) {
      return;
    }
    onSample(sample, performance.now() / 1000);
  };
  target.addEventListener('deviceorientation', onOrientation);
  return () => target.removeEventListener('deviceorientation', onOrientation);
}
