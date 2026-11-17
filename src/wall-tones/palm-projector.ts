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
/** The beam/glow root sits this far along the palm normal from the palm's
 * joint-plane center (meters): on the skin, not at bone depth, so the
 * projector reads as rising out of the palm itself (Nov 16 user feedback:
 * the root looked sunk toward the wrist). */
export const PALM_SURFACE_LIFT = 0.012;
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
  /** Palm-surface center: where the projector beam and glow root. */
  origin: PalmVec;
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
  // Palm center from the whole knuckle line, not one metacarpal: single-joint
  // placement differs between runtimes (Nov 16 hardware feedback: the root
  // showed at the wrist), and the four-knuckle average stays centered even
  // then.
  const knuckleMid = {
    x: (j.indexMcp.x + j.middleMcp.x + j.ringMcp.x + j.pinkyMcp.x) / 4,
    y: (j.indexMcp.y + j.middleMcp.y + j.ringMcp.y + j.pinkyMcp.y) / 4,
    z: (j.indexMcp.z + j.middleMcp.z + j.ringMcp.z + j.pinkyMcp.z) / 4,
  };
  const mid = { x: (j.wrist.x + knuckleMid.x) / 2, y: (j.wrist.y + knuckleMid.y) / 2, z: (j.wrist.z + knuckleMid.z) / 2 };
  const center = { x: mid.x + normal.x * PALM_PANEL_LIFT, y: mid.y + normal.y * PALM_PANEL_LIFT, z: mid.z + normal.z * PALM_PANEL_LIFT };
  const origin = { x: mid.x + normal.x * PALM_SURFACE_LIFT, y: mid.y + normal.y * PALM_SURFACE_LIFT, z: mid.z + normal.z * PALM_SURFACE_LIFT };
  return { openFlat, center, normal, along, origin, fingers };
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

/** Cone top (panel-side) radius of the projector beam, meters. */
export const BEAM_TOP_RADIUS = 0.055;
/** Cone base (palm-side) radius of the projector beam, meters. */
export const BEAM_BOTTOM_RADIUS = 0.006;
/** Clearance kept between the beam's tilted top rim and the panel plane. */
export const BEAM_TOP_MARGIN = 0.006;
/** Most the beam may shorten to fit under the panel (fraction of full length). */
export const BEAM_MAX_SHORTEN_RATIO = 0.35;
/** Smallest top-radius scale applied while fitting under the panel. */
export const BEAM_MIN_RADIUS_SCALE = 0.12;

export interface BeamPanelFit {
  /** Beam length along its direction (meters). */
  length: number;
  /** Scale applied to the cone's radii so its tilted rim stays under the panel. */
  radiusScale: number;
}

/**
 * Fit the projector beam under the head-facing panel plane. The cone's top
 * disc is tilted against that plane; every rim point must stay on the palm
 * side of it (rim margin BEAM_TOP_MARGIN) so no part of the cone floats
 * between the panel and the head.
 *
 * Nov 16 hardware feedback: the previous fit only shortened the beam
 * (len = full - (r*sin+margin)/cos), which collapsed it to a 2 cm stub exactly
 * at the tilted hand angles where the user looked for it - the beam "went
 * away" at those angles. This fit caps the shortening at
 * BEAM_MAX_SHORTEN_RATIO of the full length and shrinks the top radius for
 * the remaining tilt, so the beam keeps its reach at every angle.
 *
 * cosTheta is dot(beamDirection, panelNormal). At or below ~0 the beam runs
 * across or away from the panel face: the rim spills toward the head like
 * light hitting the panel edge, which reads fine, so the cone keeps its full
 * radius and only a fixed margin applies.
 */
export function fitBeamUnderPanel(fullLength: number, cosTheta: number): BeamPanelFit {
  if (cosTheta <= 1e-3) {
    return { length: Math.max(0.02, fullLength - BEAM_TOP_MARGIN), radiusScale: 1 };
  }
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const shortenNeeded = (BEAM_TOP_RADIUS * sinTheta + BEAM_TOP_MARGIN) / cosTheta;
  const maxShorten = BEAM_MAX_SHORTEN_RATIO * fullLength;
  if (shortenNeeded <= maxShorten) {
    return { length: Math.max(0.02, fullLength - shortenNeeded), radiusScale: 1 };
  }
  const length = Math.max(0.02, fullLength - maxShorten);
  const radiusFit = (maxShorten * cosTheta - BEAM_TOP_MARGIN) / Math.max(sinTheta, 1e-3);
  const radiusScale = Math.min(1, Math.max(BEAM_MIN_RADIUS_SCALE, radiusFit / BEAM_TOP_RADIUS));
  return { length, radiusScale };
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

/**
 * One-time narrator prompt for the palm projector (backlog item 109, wording
 * approved by the owner 2026-11-17): due only after the THIRD completed
 * pattern, in an immersive (MR) session, with the projector display mode
 * active. The caller consumes the one-shot flag (economy.takeFirstTime) only
 * when this returns true, so desktop/phone and wristband-mode players keep
 * the prompt for a later MR projector run. Kept engine-free for node tests.
 */
export function palmProjectorPromptDue(
  streak: number,
  immersive: boolean,
  displayMode: 'band' | 'projector',
): boolean {
  return streak === 3 && immersive && displayMode === 'projector';
}
