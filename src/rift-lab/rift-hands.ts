/**
 * Rift Lab: open-palm pose math over raw WebXR hand joints.
 *
 * Pure functions, no three.js or XR runtime imports, so the pose math is
 * unit-testable with synthetic joint buffers. The system feeds it the
 * XRHandVisualAdapter's `jointTransforms` (25 joints x 16 floats,
 * column-major matrices relative to the grip space) plus the grip space's
 * world matrix, and gets back a world-space palm center, aim direction and
 * an open/closed verdict for the seal beam (his 12:15 input: open palm
 * fires the beam).
 *
 * Thresholds here are starting points for on-headset tuning - the reason
 * this Lab exists - not settled balance.
 */

/** WebXR hand joint indices, spec order (XRHand size is 25). */
export const HAND_JOINT = {
  wrist: 0,
  indexProximal: 6,
  indexTip: 9,
  middleMetacarpal: 10,
  middleProximal: 11,
  middleTip: 14,
  ringProximal: 16,
  ringTip: 19,
  pinkyProximal: 21,
  pinkyTip: 24,
} as const;

/** Fingers checked for the open-palm verdict; the thumb is ignored. */
const FINGERS = [
  { proximal: HAND_JOINT.indexProximal, tip: HAND_JOINT.indexTip },
  { proximal: HAND_JOINT.middleProximal, tip: HAND_JOINT.middleTip },
  { proximal: HAND_JOINT.ringProximal, tip: HAND_JOINT.ringTip },
  { proximal: HAND_JOINT.pinkyProximal, tip: HAND_JOINT.pinkyTip },
] as const;

/** A finger counts as extended when its tip sits this much farther from the
 * wrist than its proximal joint (ratio, so hand size cancels out). */
export const FINGER_EXTENSION_RATIO = 1.55;
/** Starting the beam needs a really open hand: all four fingers fully
 * extended (his 23:49 Quest feedback: a barely opened fist fired it). */
export const OPEN_PALM_MIN_EXTENDED = 4;
/** Once firing, the beam keeps going until the hand loosens past this
 * (hysteresis, so tracking jitter does not flicker the beam). */
export const HOLD_EXTENSION_RATIO = 1.35;
export const HOLD_PALM_MIN_EXTENDED = 3;

export interface PalmPose {
  /** World-space palm center (middle finger metacarpal). */
  center: [number, number, number];
  /** World-space unit direction the open palm fires along (wrist to
   * middle-finger metacarpal: roughly where the fingers point). */
  direction: [number, number, number];
  /** True when the hand reads as a really open palm (start gate). */
  open: boolean;
  /** True while the hand is still open enough to keep a running beam. */
  holdOpen: boolean;
  /** How many of the four checked fingers are extended (0-4). */
  extendedFingers: number;
  /** World-space position of all 25 joints (x,y,z per joint), so effects can
   * follow the real hand shape. */
  joints: Float32Array;
}

function jointPosition(
  joints: Float32Array,
  joint: number,
  out: [number, number, number],
): void {
  const o = joint * 16;
  out[0] = joints[o + 12];
  out[1] = joints[o + 13];
  out[2] = joints[o + 14];
}

function distance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function transformPoint(
  m: ArrayLike<number>,
  p: readonly [number, number, number],
  out: [number, number, number],
): void {
  // Column-major 4x4 (three.js Matrix4.elements layout) times a point.
  const x = p[0];
  const y = p[1];
  const z = p[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

/**
 * Read the palm pose from one hand's joint buffer. Returns null when the
 * buffer is missing or the wrong length (tracking not available).
 * Extension ratios are computed in grip space (a rigid transform, so the
 * ratio survives to world space); center and direction are world space.
 */
export function readPalmPose(
  joints: Float32Array | null | undefined,
  gripWorldElements: ArrayLike<number>,
): PalmPose | null {
  if (joints == null || joints.length < 25 * 16) {
    return null;
  }
  const wrist: [number, number, number] = [0, 0, 0];
  jointPosition(joints, HAND_JOINT.wrist, wrist);

  let extendedFingers = 0;
  let holdFingers = 0;
  const proximal: [number, number, number] = [0, 0, 0];
  const tip: [number, number, number] = [0, 0, 0];
  for (const finger of FINGERS) {
    jointPosition(joints, finger.proximal, proximal);
    jointPosition(joints, finger.tip, tip);
    const tipDist = distance(tip, wrist);
    const proxDist = distance(proximal, wrist);
    if (tipDist > proxDist * FINGER_EXTENSION_RATIO) {
      extendedFingers += 1;
    }
    if (tipDist > proxDist * HOLD_EXTENSION_RATIO) {
      holdFingers += 1;
    }
  }

  const mcpLocal: [number, number, number] = [0, 0, 0];
  jointPosition(joints, HAND_JOINT.middleMetacarpal, mcpLocal);
  const center: [number, number, number] = [0, 0, 0];
  const wristWorld: [number, number, number] = [0, 0, 0];
  transformPoint(gripWorldElements, mcpLocal, center);
  transformPoint(gripWorldElements, wrist, wristWorld);

  const dx = center[0] - wristWorld[0];
  const dy = center[1] - wristWorld[1];
  const dz = center[2] - wristWorld[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) {
    return null; // degenerate tracking frame
  }
  const jointsWorld = new Float32Array(25 * 3);
  const local: [number, number, number] = [0, 0, 0];
  const world: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < 25; j++) {
    jointPosition(joints, j, local);
    transformPoint(gripWorldElements, local, world);
    jointsWorld[j * 3] = world[0];
    jointsWorld[j * 3 + 1] = world[1];
    jointsWorld[j * 3 + 2] = world[2];
  }
  return {
    joints: jointsWorld,
    center,
    direction: [dx / len, dy / len, dz / len],
    open: extendedFingers >= OPEN_PALM_MIN_EXTENDED,
    holdOpen: holdFingers >= HOLD_PALM_MIN_EXTENDED,
    extendedFingers,
  };
}

/**
 * Bone segments that make up the visible hand shape (joint index pairs):
 * every finger chain from the wrist out to the tip, the thumb, and the
 * knuckle line across the palm. Notes ride these segments so the cloud takes
 * the shape of the hand instead of a ball (his 23:48 Quest feedback).
 */
const CHAINS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4], // thumb
  [0, 5, 6, 7, 8, 9], // index
  [0, 10, 11, 12, 13, 14], // middle
  [0, 15, 16, 17, 18, 19], // ring
  [0, 20, 21, 22, 23, 24], // pinky
];
export const HAND_SEGMENTS: readonly (readonly [number, number])[] = [
  ...CHAINS.flatMap((chain) =>
    chain.slice(1).map((joint, i): [number, number] => [chain[i], joint]),
  ),
  [5, 10],
  [10, 15],
  [15, 20],
];

/**
 * Point along hand segment `segment` at fraction `t` (0..1) from world joint
 * positions, plus the segment direction for orbiting around the bone.
 * Returns false when the segment is degenerate.
 */
export function pointOnHandShape(
  jointsWorld: Float32Array,
  segment: number,
  t: number,
  outPoint: [number, number, number],
  outDir: [number, number, number],
): boolean {
  const [a, b] = HAND_SEGMENTS[segment % HAND_SEGMENTS.length];
  const ax = jointsWorld[a * 3];
  const ay = jointsWorld[a * 3 + 1];
  const az = jointsWorld[a * 3 + 2];
  const dx = jointsWorld[b * 3] - ax;
  const dy = jointsWorld[b * 3 + 1] - ay;
  const dz = jointsWorld[b * 3 + 2] - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return false;
  outPoint[0] = ax + dx * t;
  outPoint[1] = ay + dy * t;
  outPoint[2] = az + dz * t;
  outDir[0] = dx / len;
  outDir[1] = dy / len;
  outDir[2] = dz / len;
  return true;
}
