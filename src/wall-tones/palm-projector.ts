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
/** The panel floats this far above mid-palm along the palm normal (meters).
 * Raised 0.14 -> 0.18 on Nov 16 user feedback: a little more height keeps the
 * hand and its tracking outline clear of the panel when looking slightly up. */
export const PALM_PANEL_LIFT = 0.18;
/** The panel also floats this far horizontally away from the player's head (meters). */
export const PALM_PANEL_HEAD_AWAY = 0.06;
/** Hysteresis for the open-palm gate: real hand tracking flaps near a single
 * threshold, which visibly restarts the unfold animation. Opening needs the
 * full snapshot gate; the panel stays open until the pose clearly leaves it. */
export const PALM_OPEN_MIN_FINGERS = 3;
export const PALM_CLOSE_MAX_FINGERS = 1;
export const PALM_OPEN_UP_MIN = 0.65;
export const PALM_STILL_UP_MIN = 0.55;
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
  /** How many fingers read as extended (for the hysteresis gate). */
  fingers: number;
}
export function palmPanelPose(j: PalmJoints, hand: 'left' | 'right'): PalmPanelPose {
  const along = norm(sub(j.middleMcp, j.wrist));
  const across = sub(j.indexMcp, j.pinkyMcp);
  let normal = norm(cross(along, across));
  // Palm winding flips between hands; the normal must point out of the palm.
  if (hand === 'right') normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  const fingers = extendedFingerCount(j);
  const openFlat = fingers >= PALM_OPEN_MIN_FINGERS && normal.y >= PALM_UP_MIN;
  const mid = { x: (j.wrist.x + j.middleMcp.x) / 2, y: (j.wrist.y + j.middleMcp.y) / 2, z: (j.wrist.z + j.middleMcp.z) / 2 };
  const center = { x: mid.x + normal.x * PALM_PANEL_LIFT, y: mid.y + normal.y * PALM_PANEL_LIFT, z: mid.z + normal.z * PALM_PANEL_LIFT };
  return { openFlat, center, normal, along, fingers };
}

/**
 * Stateful open/close decision with hysteresis. `palmPanelPose().openFlat` is a
 * per-frame snapshot; calling code feeds its previous decision back in so a
 * borderline pose does not flap the panel open and shut every frame.
 */
export function palmOpenState(j: PalmJoints, hand: 'left' | 'right', wasOpen: boolean): boolean {
  const p = palmPanelPose(j, hand);
  if (!wasOpen) return p.openFlat;
  return p.fingers > PALM_CLOSE_MAX_FINGERS && p.normal.y >= PALM_STILL_UP_MIN;
}

/**
 * One Euro filter (Casiez et al.): low-pass whose cutoff rises with the
 * signal's own speed. At rest the cutoff sits at minCutoff so sensor jitter is
 * heavily damped; once the signal actually moves, the cutoff scales with
 * beta*speed so tracking stays responsive. dt in seconds, positions in meters.
 */
export class OneEuro {
  private xPrev: number | undefined;
  private dxPrev = 0;
  constructor(
    private readonly minCutoff = 0.5,
    private readonly beta = 3,
    private readonly dCutoff = 1,
  ) {}
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, dt: number): number {
    if (this.xPrev === undefined || dt <= 0) { this.xPrev = x; this.dxPrev = 0; return x; }
    const dx = (x - this.xPrev) / dt;
    const dA = this.alpha(this.dCutoff, dt);
    const dxHat = dA * dx + (1 - dA) * this.dxPrev;
    const a = this.alpha(this.minCutoff + this.beta * Math.abs(dxHat), dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat; this.dxPrev = dxHat;
    return xHat;
  }
  reset(): void { this.xPrev = undefined; this.dxPrev = 0; }
}

/**
 * Smooths every tracked palm joint with its own One Euro filter. Raw Quest hand
 * joints carry several millimeters of per-frame noise; smoothing the joints
 * first keeps the derived palm center, normal and finger-extension gate stable,
 * instead of filtering the panel after that noise has already been amplified
 * through cross products and thresholds.
 */
export class PalmJointsSmoother {
  private readonly filters: Record<string, { x: OneEuro; y: OneEuro; z: OneEuro }> = {};
  private readonly make = () => ({ x: new OneEuro(), y: new OneEuro(), z: new OneEuro() });
  filter(j: PalmJoints, dt: number): PalmJoints {
    const out = {} as Record<keyof PalmJoints, PalmVec>;
    for (const key of Object.keys(j) as (keyof PalmJoints)[]) {
      const f = this.filters[key] ?? (this.filters[key] = this.make());
      const v = j[key];
      out[key] = { x: f.x.filter(v.x, dt), y: f.y.filter(v.y, dt), z: f.z.filter(v.z, dt) };
    }
    return out;
  }
  reset(): void { for (const key of Object.keys(this.filters)) delete this.filters[key]; }
}

/**
 * Band-mode joint frame as a constant rotation on top of the anatomical frame
 * A = [wrist->middle-MCP, palm normal, their cross]. Measured Nov 2026 from the
 * emulator's synthetic hand, where the band's look was tuned and approved:
 * anatomy * this rotation reproduces that pose exactly (pos < 1e-6 m, rot < 1e-4
 * across left/right hands and two poses), while staying independent of each
 * platform's wrist-joint frame twist (the Quest clipping symptom).
 */
export const BAND_JOINT_ROTATION: readonly (readonly number[])[] = [
  [0.1019, -0.2168, -0.9709],
  [0.0098, -0.9757, 0.2189],
  [-0.9947, -0.0318, -0.0973],
];
