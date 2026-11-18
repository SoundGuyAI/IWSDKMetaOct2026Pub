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
 * |beta| above which the phone is near or past vertical and raw beta/gamma
 * stop separating the gesture axes: at upright, beta measures the phone
 * top's total tilt from vertical REGARDLESS of direction, so a left-right
 * top tilt ("no") produces the same beta excursion as a nod ("yes"), and
 * iOS's gamma reflection flips sign as beta crosses +-90 (the owner's
 * Nov 16 iPhone retest: a nod through vertical read yaw ~100-160 deg for
 * seconds and answered "no" at 81.7 deg). Freezing yaw in the zone then
 * made every upright shake read as a nod (the owner's Nov 17 iPhone
 * report: upright "no" answered "yes").
 *
 * The tracker handles the zone in two phases. While the phone is moving
 * through the zone (a stroke that started below it, like the Nov 16
 * rolled nod resting at beta 75) it keeps the validated behavior: yaw
 * frozen, pitch on raw beta against the carried baseline. Once the phone
 * SETTLES inside the zone - the owner is holding it pointing up - it
 * switches to the world-up vector in device coordinates, which stays
 * continuous and axis-separated through vertical: pitchLeanDeg reads the
 * top's forward/back lean (a nod), yawLeanDeg its sideways lean (a top
 * tilt left/right or a roll). Both phases converge their baselines to the
 * resting pose while still, so gestures read out-and-back from where the
 * phone actually rests.
 *
 * Documented gravity-only limit: a pure swivel about the phone's
 * bottom-top axis at near-vertical (a head-shake style "no") leaves the
 * up vector unchanged, so it registers as NEITHER gesture - never as a
 * wrong answer. Catching that variant would need the compass or gyro.
 */
export const TILT_GIMBAL_ZONE_BETA_DEG = 80;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Forward/back lean of the phone's top from the world-up vector in device
 * coordinates (up_y vs up_z): rotation about the device x-axis. Equals
 * beta when gamma is 0, but stays continuous and nod-specific through
 * beta = +-90 where raw beta becomes direction-blind.
 */
export function pitchLeanDeg(betaDeg: number, gammaDeg: number): number {
  const beta = betaDeg * DEG_TO_RAD;
  const gamma = gammaDeg * DEG_TO_RAD;
  return (
    Math.atan2(Math.sin(beta), Math.cos(beta) * Math.cos(gamma)) * RAD_TO_DEG
  );
}

/**
 * Sideways lean of the phone's top from the world-up vector (up_x): a top
 * tilt left/right (device z rotation) or a roll (device y rotation).
 * Equals gamma when beta is 0; near vertical it keeps reading the tilt
 * that raw beta absorbs into the pitch axis.
 */
export function yawLeanDeg(betaDeg: number, gammaDeg: number): number {
  const beta = betaDeg * DEG_TO_RAD;
  const gamma = gammaDeg * DEG_TO_RAD;
  return (
    Math.atan2(
      Math.cos(beta) * Math.sin(gamma),
      Math.hypot(Math.sin(beta), Math.cos(beta) * Math.cos(gamma)),
    ) * RAD_TO_DEG
  );
}
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
  private zoneMode: 'frozen' | 'lean' | null = null;
  private zoneBasePitch: number | null = null;
  private zoneBaseYaw: number | null = null;
  private lastZonePitch: number | null = null;
  private lastZoneYaw: number | null = null;
  private stillEvents = 0;

  reset(): void {
    this.baseBeta = null;
    this.baseGamma = null;
    this.lastBeta = null;
    this.lastGamma = null;
    this.zoneMode = null;
    this.zoneBasePitch = null;
    this.zoneBaseYaw = null;
    this.lastZonePitch = null;
    this.lastZoneYaw = null;
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
    if (Math.abs(betaDeg) > TILT_GIMBAL_ZONE_BETA_DEG && !this.zoneMode) {
      // Entering the zone from below: a stroke may already be in progress
      // (owner's Nov 16 rolled nod resting at beta 75, crossing vertical),
      // so start in frozen mode - the raw-beta behavior the Nov 16 retest
      // validated. The baseline carries over from below the zone.
      this.zoneMode = 'frozen';
      this.stillEvents = 0;
    }
    if (this.zoneMode === 'frozen') {
      // In the zone but not settled: gamma is reflected/untrusted, so yaw
      // is frozen and pitch stays on raw beta against the carried
      // baseline. While the phone is still the beta baseline converges to
      // the resting pose; once settled (the owner is HOLDING the phone
      // pointing up, not passing through), switch to the axis-separated
      // lean measures - from a settled upright hold a left-right top tilt
      // must read as a shake, not a nod (owner's Nov 17 report), and raw
      // beta cannot tell the two apart near vertical.
      if (this.baseBeta == null) {
        this.baseBeta = betaDeg;
      }
      this.baseGamma = gammaDeg;
      let settled = false;
      if (this.lastBeta != null) {
        const dBeta = betaDeg - this.lastBeta;
        if (Math.abs(dBeta) <= TILT_STILL_DEG_PER_EVENT) {
          this.stillEvents += 1;
          if (this.stillEvents >= TILT_STILL_EVENTS_TO_TRACK) {
            this.baseBeta +=
              (betaDeg - this.baseBeta) * TILT_REST_TRACK_ALPHA;
            settled = true;
          }
        } else {
          this.stillEvents = 0;
        }
      }
      this.lastBeta = betaDeg;
      this.lastGamma = gammaDeg;
      if (settled) {
        // Anchor the lean baselines at the converged resting pose; the
        // pitch sample is ~0 on both measures here, so the switch is
        // continuous for the detector.
        this.zoneMode = 'lean';
        this.zoneBasePitch = pitchLeanDeg(betaDeg, gammaDeg);
        this.zoneBaseYaw = yawLeanDeg(betaDeg, gammaDeg);
        this.lastZonePitch = this.zoneBasePitch;
        this.lastZoneYaw = this.zoneBaseYaw;
        this.stillEvents = 0;
        return rotateToScreenFrame(0, 0, orientationAngleDeg);
      }
      return rotateToScreenFrame(
        betaDeg - this.baseBeta,
        0,
        orientationAngleDeg,
      );
    }
    if (this.zoneMode === 'lean') {
      // Settled upright hold: axis-separated leans from the world-up
      // vector (see TILT_GIMBAL_ZONE_BETA_DEG). Sticky while the phone is
      // moving - iOS's reflection makes the reported beta dive below 80
      // mid-nod from a past-vertical hold (true beta 95 -> 107 reports as
      // 85 -> 73), and switching measures mid-stroke collapses the
      // gesture; exits only after the phone settles below the zone. The
      // lean measures are valid at every angle, so the transition is
      // exact. Baselines converge to the resting pose while still, so a
      // gesture reads out-and-back from where the phone actually rests
      // (the other Nov 17 report: with the anchor frozen, upright nods
      // never returned to baseline and nothing registered).
      const pitch = pitchLeanDeg(betaDeg, gammaDeg);
      const yaw = yawLeanDeg(betaDeg, gammaDeg);
      let exit = false;
      if (this.lastZonePitch != null && this.lastZoneYaw != null) {
        const dPitch = pitch - this.lastZonePitch;
        const dYaw = yaw - this.lastZoneYaw;
        if (Math.hypot(dPitch, dYaw) <= TILT_STILL_DEG_PER_EVENT) {
          this.stillEvents += 1;
          if (this.stillEvents >= TILT_STILL_EVENTS_TO_TRACK) {
            this.zoneBasePitch! +=
              (pitch - this.zoneBasePitch!) * TILT_REST_TRACK_ALPHA;
            this.zoneBaseYaw! +=
              (yaw - this.zoneBaseYaw!) * TILT_REST_TRACK_ALPHA;
            if (Math.abs(betaDeg) <= TILT_GIMBAL_ZONE_BETA_DEG) {
              exit = true;
            }
          }
        } else {
          this.stillEvents = 0;
        }
      }
      if (exit) {
        // Settled below the zone: return to the raw-axis measures,
        // re-anchoring them fresh from the resting pose.
        this.zoneMode = null;
        this.zoneBasePitch = null;
        this.zoneBaseYaw = null;
        this.lastZonePitch = null;
        this.lastZoneYaw = null;
        this.baseBeta = null;
        this.baseGamma = null;
        this.stillEvents = 0;
      } else {
        this.lastZonePitch = pitch;
        this.lastZoneYaw = yaw;
        this.lastBeta = betaDeg;
        this.lastGamma = gammaDeg;
        return rotateToScreenFrame(
          pitch - this.zoneBasePitch!,
          yaw - this.zoneBaseYaw!,
          orientationAngleDeg,
        );
      }
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
