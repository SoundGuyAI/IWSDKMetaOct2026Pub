/**
 * Direct fingertip presses on the palm-projector panel buttons. Pure vector
 * math with no engine imports so unit tests can slice it.
 *
 * Nov 17 Quest feedback: the panel's UIKit buttons did not respond reliably
 * to physical pokes. The UIKit pointer path needs a down+up pair on the same
 * element inside an 800 ms click window while the panel billboards and
 * soft-follows the palm; the play pads already proved the reliable pattern on
 * hardware - a per-frame geometric fingertip hit test. This module is that
 * pattern specialized to small panel buttons: a front-biased slab around each
 * button face, an edge-triggered press when the fingertip crosses the face
 * plane, and a re-arm only after the finger leaves the hover slab.
 */

export interface PressVec { x: number; y: number; z: number }

/** One button's world-space frame: center + unit basis (right/up/out of the
 * panel toward the player) and half extents in meters. */
export interface ButtonFrameWorld {
  center: PressVec;
  right: PressVec;
  up: PressVec;
  out: PressVec;
  halfWidth: number;
  halfHeight: number;
}

/** Hover slab: this much wider than the button on x/y (m). */
export const DIRECT_PRESS_HOVER_MARGIN_M = 0.008;
/** Press center tolerance: still counts when the fingertip is just off the face (m). */
export const DIRECT_PRESS_PRESS_MARGIN_M = 0.002;
/** Hover slab reaches this far in front of the face (m). */
export const DIRECT_PRESS_HOVER_FRONT_M = 0.035;
/** Hover slab reaches this far behind the face (m). */
export const DIRECT_PRESS_HOVER_BEHIND_M = 0.008;
/** Fingertip this close to the face plane (or past it) counts as touching (m). */
export const DIRECT_PRESS_ENTER_M = 0.006;
/** Punch-through allowance behind the face (m). */
export const DIRECT_PRESS_THROUGH_M = 0.014;
/** Cap on the visual push-in depth (m). */
export const DIRECT_PRESS_PUSH_MAX_M = 0.003;
/** Minimum gap between two fires of the same button (ms). */
export const DIRECT_PRESS_REFIRE_MS = 300;

export interface DirectPressSample {
  /** Inside the generous hover slab. */
  hover: boolean;
  /** Touching/pushing through the face inside the press region. */
  press: boolean;
  /** Meters past the face plane, 0 while not through. Drives the push-in look. */
  depth: number;
  /** Face-plane offset from the button center (m), for diagnostics. */
  dx: number;
  dy: number;
  /** Signed distance in front of the face plane (m), negative once through. */
  dz: number;
}

const dot = (a: PressVec, b: PressVec): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Where the fingertip sits relative to one button face, in world space. */
export function directPressSample(tip: PressVec, b: ButtonFrameWorld): DirectPressSample {
  const rel = { x: tip.x - b.center.x, y: tip.y - b.center.y, z: tip.z - b.center.z };
  const dx = dot(rel, b.right);
  const dy = dot(rel, b.up);
  const dz = dot(rel, b.out);
  const hover =
    Math.abs(dx) <= b.halfWidth + DIRECT_PRESS_HOVER_MARGIN_M &&
    Math.abs(dy) <= b.halfHeight + DIRECT_PRESS_HOVER_MARGIN_M &&
    dz >= -DIRECT_PRESS_HOVER_BEHIND_M && dz <= DIRECT_PRESS_HOVER_FRONT_M;
  const press =
    Math.abs(dx) <= b.halfWidth + DIRECT_PRESS_PRESS_MARGIN_M &&
    Math.abs(dy) <= b.halfHeight + DIRECT_PRESS_PRESS_MARGIN_M &&
    dz <= DIRECT_PRESS_ENTER_M && dz >= -DIRECT_PRESS_THROUGH_M;
  return { hover, press, depth: Math.max(0, -dz), dx, dy, dz };
}

export interface DirectPressHandState {
  hover: boolean;
  pressed: boolean;
}

export interface DirectPressStep {
  state: DirectPressHandState;
  /** True exactly once, on the frame the fingertip crosses into the press region. */
  fire: boolean;
}

/**
 * Edge-triggered press state for one hand on one button. Fires once on entry;
 * while the finger stays anywhere in the hover slab the button stays latched,
 * so re-crossing the face plane without fully pulling away cannot double-fire.
 * Re-arms only after the finger leaves the hover slab.
 */
export function directPressNext(prev: DirectPressHandState, s: DirectPressSample): DirectPressStep {
  const fire = s.press && !prev.pressed;
  const pressed = s.press || (prev.pressed && s.hover);
  return { state: { hover: s.hover, pressed }, fire };
}
