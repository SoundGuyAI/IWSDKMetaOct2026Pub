/**
 * Palm-projector math for the MR armband's projector display mode: the same
 * wristband panel floats above the open, flat, horizontal palm of the SAME
 * hand. Pure vector math with no engine imports so unit tests can slice it.
 */
export type PalmVec = { x: number; y: number; z: number };
export interface PalmJoints {
  wrist: PalmVec;
  indexMcp: PalmVec; middleMcp: PalmVec; ringMcp: PalmVec; pinkyMcp: PalmVec;
  indexTip: PalmVec; middleTip: PalmVec; ringTip: PalmVec; pinkyTip: PalmVec;
}
/** Palm normal must be within acos(0.65) ~ 49 deg of straight up. */
export const PALM_UP_MIN = 0.65;
/** Tip-to-knuckle distance (meters) beyond which a finger counts as extended. */
export const FINGER_EXTENDED_MIN = 0.055;
/** The panel floats this far above mid-palm along the palm normal (meters). */
export const PALM_PANEL_LIFT = 0.09;
const sub = (a: PalmVec, b: PalmVec): PalmVec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: PalmVec, b: PalmVec): PalmVec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: PalmVec): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: PalmVec): PalmVec => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const dist = (a: PalmVec, b: PalmVec): number => len(sub(a, b));
/** Count of extended fingers: a fist reads 0-1, an open flat hand reads 4. */
export function extendedFingerCount(j: PalmJoints): number {
  let n = 0;
  const pairs: ReadonlyArray<readonly [PalmVec, PalmVec]> = [
    [j.indexTip, j.indexMcp], [j.middleTip, j.middleMcp], [j.ringTip, j.ringMcp], [j.pinkyTip, j.pinkyMcp],
  ];
  for (const [tip, mcp] of pairs) if (dist(tip, mcp) > FINGER_EXTENDED_MIN) n++;
  return n;
}
export interface PalmPanelPose {
  /** True while the hand is open, flat and horizontal, palm up. */
  openFlat: boolean;
  /** Panel center: above mid-palm along the palm normal. */
  center: PalmVec;
  /** Unit palm normal: the panel faces along it. */
  normal: PalmVec;
  /** Unit wrist-to-fingers direction: the panel's text "up". */
  along: PalmVec;
}
export function palmPanelPose(j: PalmJoints, hand: 'left' | 'right'): PalmPanelPose {
  const along = norm(sub(j.middleMcp, j.wrist));
  const across = sub(j.indexMcp, j.pinkyMcp);
  let normal = norm(cross(along, across));
  // Palm winding flips between hands; the normal must point out of the palm.
  if (hand === 'right') normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  const openFlat = extendedFingerCount(j) >= 3 && normal.y >= PALM_UP_MIN;
  const mid = { x: (j.wrist.x + j.middleMcp.x) / 2, y: (j.wrist.y + j.middleMcp.y) / 2, z: (j.wrist.z + j.middleMcp.z) / 2 };
  const center = { x: mid.x + normal.x * PALM_PANEL_LIFT, y: mid.y + normal.y * PALM_PANEL_LIFT, z: mid.z + normal.z * PALM_PANEL_LIFT };
  return { openFlat, center, normal, along };
}
