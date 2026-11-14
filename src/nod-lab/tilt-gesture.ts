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

/** Baseline-relative device orientation (beta = pitch, gamma = roll). */
export class TiltBaselineTracker {
  private baseBeta: number | null = null;
  private baseGamma: number | null = null;

  reset(): void {
    this.baseBeta = null;
    this.baseGamma = null;
  }

  /** Null angles (desktop laptops, some browsers) produce no sample. */
  feed(betaDeg: number | null, gammaDeg: number | null): GestureAngleSample | null {
    if (betaDeg == null || gammaDeg == null) {
      return null;
    }
    if (this.baseBeta == null || this.baseGamma == null) {
      this.baseBeta = betaDeg;
      this.baseGamma = gammaDeg;
    }
    return {
      pitchDeg: betaDeg - this.baseBeta,
      yawDeg: gammaDeg - this.baseGamma,
    };
  }
}

/**
 * Attach a deviceorientation feed. The handler only samples while `armed()`
 * is true (a lab prompt listening in flat mode), so orientation is never
 * tracked outside the lab. Returns the detach function.
 */
export function attachTiltTracker(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  tracker: TiltBaselineTracker,
  armed: () => boolean,
  onSample: (sample: GestureAngleSample, nowSec: number) => void,
): () => void {
  const onOrientation = (event: Event) => {
    if (!armed()) {
      return;
    }
    const orientation = event as DeviceOrientationEvent;
    const sample = tracker.feed(orientation.beta, orientation.gamma);
    if (sample != null) {
      onSample(sample, performance.now() / 1000);
    }
  };
  target.addEventListener('deviceorientation', onOrientation);
  return () => target.removeEventListener('deviceorientation', onOrientation);
}
