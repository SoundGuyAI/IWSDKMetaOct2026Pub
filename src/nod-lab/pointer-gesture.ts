/**
 * Flat-mode pointer gestures for the nod yes/no lab: a mouse (or touch)
 * drag that swings up-and-down answers yes, left-and-right answers no.
 *
 * The tracker only converts pointer positions into baseline-relative
 * degrees; detection reuses HeadNodShakeDetector configured with
 * returnToBaselineRad, so a gesture must be a true out-and-back swing
 * (a one-way drag toward a button never answers) while sensitivity,
 * dominance and cooldown stay identical to the headset path.
 *
 * A pointer does not re-center the way a head does, so after a pause the
 * baseline re-anchors at the pointer's resting spot.
 */

export interface GestureAngleSample {
  readonly pitchDeg: number;
  readonly yawDeg: number;
}

/** Pixels of pointer travel that read as one degree of head pitch/yaw.
 * 2 px/deg keeps the detector's degree thresholds but halves the drag
 * distance: a nod/shake peaks at ~28 px of travel instead of ~42 px, which
 * is what desktop testers asked for. The out-and-back, dominance and
 * cooldown guards are unchanged, so casual one-way mouse travel to a button
 * still never answers. */
export const POINTER_PX_PER_DEG = 2;

/**
 * A feed gap longer than this re-anchors the baseline at the pointer's
 * spot. The limit sits just past the detector's gesture window: pauses
 * inside one gesture are far shorter, and a pause longer than the window
 * cannot be part of one gesture anyway. (A shorter limit misfires on
 * slow-render devices where pointer events arrive in frame-rate bursts,
 * wiping a half-fed gesture.)
 */
export const POINTER_IDLE_REPRIME_SEC = 0.6;

export class PointerGestureTracker {
  private baselineX = 0;
  private baselineY = 0;
  private lastAt = -1;
  private primed = false;
  private reprimedFlag = false;

  /** Forget the baseline; the next feed re-anchors at the pointer's spot. */
  reset(): void {
    this.primed = false;
    this.lastAt = -1;
  }

  /**
   * True once after a feed re-anchored the baseline. The detector must be
   * reset on a re-anchor: any extreme armed before the pause measured from
   * the old baseline and would commit against the new one.
   */
  consumeReprime(): boolean {
    const reprimed = this.reprimedFlag;
    this.reprimedFlag = false;
    return reprimed;
  }

  /** Feed one pointer position; angles are relative to the anchored baseline. */
  feed(clientX: number, clientY: number, nowSec: number): GestureAngleSample {
    if (
      !this.primed ||
      (this.lastAt >= 0 && nowSec - this.lastAt > POINTER_IDLE_REPRIME_SEC)
    ) {
      this.baselineX = clientX;
      this.baselineY = clientY;
      this.primed = true;
      this.reprimedFlag = true;
    }
    this.lastAt = nowSec;
    return {
      // Screen Y grows downward; dragging down reads as head-down pitch.
      pitchDeg: (clientY - this.baselineY) / POINTER_PX_PER_DEG,
      yawDeg: (clientX - this.baselineX) / POINTER_PX_PER_DEG,
    };
  }
}

/**
 * Attach a pointermove feed to a target (the lab's window). Positions are
 * fed to the tracker even while `armed()` is false so the baseline stays
 * anchored at the resting pointer: a gesture already in progress when a
 * prompt arms (the user started swinging while Cypher was still speaking)
 * then measures its full swing instead of anchoring mid-gesture. Samples
 * are only reported for detection while armed, so answers still come only
 * from a listening prompt. Returns the detach function.
 */
export function attachPointerTracker(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  tracker: PointerGestureTracker,
  armed: () => boolean,
  onSample: (sample: GestureAngleSample, nowSec: number) => void,
  onReprime?: () => void,
): () => void {
  const onMove = (event: Event) => {
    const pointer = event as PointerEvent;
    const nowSec = performance.now() / 1000;
    const sample = tracker.feed(pointer.clientX, pointer.clientY, nowSec);
    if (!armed()) {
      return;
    }
    if (tracker.consumeReprime()) {
      onReprime?.();
    }
    onSample(sample, nowSec);
  };
  target.addEventListener('pointermove', onMove);
  return () => target.removeEventListener('pointermove', onMove);
}
