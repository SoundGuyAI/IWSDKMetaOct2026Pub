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
/** Still events before the baseline starts tracking the resting pose (~0.2 s). */
export const TILT_STILL_EVENTS_TO_TRACK = 12;
/** Per-event convergence toward the resting pose while still. */
export const TILT_REST_TRACK_ALPHA = 0.2;
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

  /** Null angles (desktop laptops, some browsers) produce no sample. */
  feed(betaDeg: number | null, gammaDeg: number | null): GestureAngleSample | null {
    if (betaDeg == null || gammaDeg == null) {
      return null;
    }
    if (this.baseBeta == null || this.baseGamma == null) {
      this.baseBeta = betaDeg;
      this.baseGamma = gammaDeg;
    } else if (this.lastBeta != null && this.lastGamma != null) {
      const speed = Math.hypot(betaDeg - this.lastBeta, gammaDeg - this.lastGamma);
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
    return {
      pitchDeg: betaDeg - this.baseBeta,
      yawDeg: gammaDeg - this.baseGamma,
    };
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
): () => void {
  const onOrientation = (event: Event) => {
    const orientation = event as DeviceOrientationEvent;
    const sample = tracker.feed(orientation.beta, orientation.gamma);
    if (sample == null || !armed()) {
      return;
    }
    onSample(sample, performance.now() / 1000);
  };
  target.addEventListener('deviceorientation', onOrientation);
  return () => target.removeEventListener('deviceorientation', onOrientation);
}
