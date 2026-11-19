/**
 * Rift-sealing Lab mini-game (backlog item 75): IWSDK side.
 *
 * Lab-only prototype reached from the shared Lab menu. Placeholder rifts
 * (four-color fracture, style picked 12:27) spawn in the room; successful
 * notes charge the hands with energy shown as note particles in the four pad
 * colors orbiting both hands, densest on the firing one (his 12:20). Sealing
 * aims a hand-energy beam at a rift: open palm in XR (his 12:15), drag from
 * the fixed charge spot on mobile (settled 12:25). Layered sealing-beam /
 * hand-aura / neon-note visuals live in rift-seal-beam.ts, rift-hand-aura.ts
 * rift-note-visuals.ts and rift-portal-burst.ts (visual-only; gameplay hooks
 * unchanged).
 *
 * Settled inputs (13:38): desktop clicks the rift itself with enough energy
 * (notes fly pointer-to-rift, no hold); the enough-energy gate is shared by
 * every platform (SEAL_ENERGY_REQUIRED, settled 14:46: 12 notes = one
 * closure); while a rift is open, score/bars carry a fractional multiplier
 * until cleared (settled 14:46: x0.5; both tunable after testing).
 *
 * XR: real hand tracking. When the world is immersive and a hand is tracked,
 * notes orbit the live palm and an open palm fires the beam along the
 * fingers' direction; closing the hand or losing tracking stops it. Palm
 * thresholds and rift placement on real room surfaces are the on-headset
 * tuning this Lab exists for.
 */

import {
  createSystem,
  RayInteractable,
  UIKit,
  UIKitMLAsset,
  Visibility,
  VisibilityState,
  XRMesh,
  XRPlane,
  type Entity,
} from '@iwsdk/core';
import { collectVerticalWalls } from '../wall-tones/plane-placement.js';
import { enterXrButtonVisible } from '../enter-xr-visibility.js';
import {
  playNoteChime,
  playRiftOpen,
  playRiftSeal,
  playSealDenied,
  startBeamHum,
  startRiftAmbience,
  stopAllRiftAmbience,
  stopBeamHum,
  stopRiftAmbience,
  syncRiftAudioListener,
} from './rift-sounds.js';
import { XRHandVisualAdapter } from '@iwsdk/xr-input';
import {
  HAND_SEGMENTS,
  pointOnHandShape,
  readPalmPose,
  type PalmPose,
} from './rift-hands.js';
import { riftAimRays, riftTargetPositions } from './rift-targets.js';
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Plane,
  ShaderMaterial,
  Raycaster,
  Quaternion,
  Vector2,
  Vector3,
  Vector4,
} from '@iwsdk/core';
import {
  PAD_COLORS,
  PAD_COLOR_NAMES,
  MAX_ENERGY,
  RiftLabGame,
  type HandSide,
  type PadColorName,
  type Rift,
} from './rift-energy.js';
import {
  CLOUD_MAX_RADIUS_M,
  DESKTOP_NOTES_FLIGHT_MS,
  SEAL_ENERGY_REQUIRED,
  SEAL_HOLD_MS,
  isOverLabPanel,
} from './rift-energy.js';
import { riftEncounter } from '../wall-tones/rift-encounter.js';
import {
  closestSurfaceHit,
  createGeometryParticlePool,
  emitSpray,
  planeSurface,
  stepGeometryParticles,
  type CollisionSurface,
  type GeometryParticlePool,
  type SurfaceRayHit,
} from './rift-geometry-particles.js';
import { RiftHandAura } from './rift-hand-aura.js';
import { noteFrontVisibility, RiftHandOccluders } from './rift-hand-occluders.js';
import { noteGlyphMaterial } from './rift-note-visuals.js';
import {
  createGeoSparkDraw,
  createPortalBurst,
  disposePortalBurst,
  syncGeoSparkDraw,
  updatePortalBurst,
  type PortalBurst,
} from './rift-portal-burst.js';
import { RiftSealBeam } from './rift-seal-beam.js';

/** Virtual hand anchors in flat mode (meters, hub scene space). */
const FLAT_RIGHT_HAND = new Vector3(0.45, 1.35, -1.9);
const FLAT_LEFT_HAND = new Vector3(-0.45, 1.35, -1.9);
/** Fixed mobile charge spot (his settled mobile input): bottom-center drag. */
const CHARGE_SPOT_Y_FRAC = 0.82;
const CHARGE_SPOT_X_TOL_FRAC = 0.25;
/** Touch layout (mockup 6-rift-layout-mobile-drag, chosen "go with drag"):
 * the energy orb rests in the bottom-LEFT corner; the rift sits near the
 * bottom-right. Screen NDC of the resting orb. */
const TOUCH_ORB_NDC = { x: -0.72, y: -0.74 };
const TOUCH_ORB_ZONE = { maxXFrac: 0.4, minYFrac: 0.72 };
/** A touch drag starts only when the finger lands on the resting orb: within
 * this many CSS px of its on-screen center (~10 mm radius on an iPhone 15 Pro,
 * which is 393 pt over 65.1 mm = ~6.0 px/mm; NN/g minimum touch target 1 cm). */
const TOUCH_ORB_GRAB_RADIUS_PX = 64;
/**
 * Flat touch: the beam leaves the resting corner orb, so a pure camera-plane
 * aim can miss the rift even when the finger sits on it. When the finger is
 * within this NDC distance of a rift's projected center, soft-lock the beam
 * onto that rift (portrait flake: orb→plane ray grazed past BEAM_HIT_RADIUS).
 */
const TOUCH_RIFT_LOCK_NDC = 0.42;
/** Fingertip glow sizing (his 22:59 note: the finger hid the particles).
 * Adult index finger is 16-20 mm wide (MIT Touch Lab, 2003); the dragged
 * cloud is 50% wider than the 20 mm upper end, at ~6.0 CSS px/mm on an
 * iPhone 15 Pro: radius = 20 * 1.5 / 2 * 6.0 = 90 px. */
/** Distance of the dragged cloud from the camera along the finger ray. */
const TOUCH_CLOUD_DISTANCE_M = 1.2;
const FINGERTIP_MM = 20;
const CSS_PX_PER_MM = 6.0;
const TOUCH_GLOW_RADIUS_PX = (FINGERTIP_MM * 1.5 * CSS_PX_PER_MM) / 2;
/** Resting touch orb hovers this high: just above the floor, cloud radius
 * included, so the corner ray drops it into the visible bottom-left corner
 * instead of floating it mid-screen. */
const TOUCH_ORB_SHELF_Y_M = CLOUD_MAX_RADIUS_M + 0.02;
/** Placeholder rift ring placement in front of the panel area. */
const RIFT_POSITIONS = [
  new Vector3(1.1, 1.7, -2.4),
  new Vector3(-1.1, 1.6, -2.4),
  new Vector3(0, 2.7, -2.4), // above the panel, outside the click guard
];
const RIFT_PLANE_M = 1.8;
/** Visible fracture radius at full size (the quad has transparent margin). */
const RIFT_VISIBLE_RADIUS_M = 0.62;
/** Flat mode tries these radii in order: shrink before overlapping the menu. */
const FLAT_RIFT_RADII_M = [0.62, 0.48, 0.36, 0.28];
const FLAT_SPACING_PER_RADIUS = 2.25;
const RIFT_SPAWN_INTERVAL_MS = 6000;
const MAX_OPEN_RIFTS = 3;
/** Beam hit test: ray-to-rift distance under this counts as contact. */
const BEAM_HIT_RADIUS_M = 0.3;
/** Beam length cap when the ray misses every surface (meters). */
const BEAM_MAX_M = 8;
/** Shared welding-spark pool (item 93, absorbed from PR #131). */
const GEO_POOL_MAX = 240;
/** Sparks/sec sprayed from a sealing rift crack. */
const GEO_SPRAY_RATE = 34;
/** Burst size when a rift finishes sealing. */
const GEO_SEAL_BURST = 80;
/** Sparks/sec cascading from the beam hit point on geometry. */
const GEO_BEAM_HIT_RATE = 48;
/** Room/rift-host collision surfaces refresh this often (ms). */
const GEO_SURFACE_REFRESH_MS = 400;

const NOTE_SIZE_M = 0.034;
/** Real-wall rift placement: reachable band around eye height. */
const WALL_RIFT_BAND_BELOW_M = 0.55;
const WALL_RIFT_BAND_ABOVE_M = 0.5;
const WALL_RIFT_INSET_M = 0.3;
const WALL_RIFT_SPACING_M = 1.4;
const WALL_RIFT_OFFSET_M = 0.03;

/** Experimental palm PointLight while the seal beam fires. Toggle via debug. */
const EXPERIMENT_PALM_LIGHT = true;

export interface RiftLabDebugSnapshot {
  active: boolean;
  running: boolean;
  energy: number;
  noteCount: number;
  openRifts: number;
  modifierActive: boolean;
  beamActive: boolean;
  status: string;
  palms: Record<'left' | 'right', PalmPose | null>;
  geometryParticles: {
    alive: number;
    emitted: number;
    collisions: number;
    roomImpacts: number;
    groundImpacts: number;
    riftHostImpacts: number;
    roomPlaneSurfaces: number;
    riftHostSurfaces: number;
    groundSurface: boolean;
  };
  targets: { id: number; position: number[]; ndc: number[] }[];
  noteOriginNdc: number[];
  /** On-screen radius (CSS px) the dragged note cloud is sized to. */
  noteCloudRadiusPx: number;
  /** Viewer pose, for QA placement of synthetic hands. */
  cameraPos: number[];
  cameraDir: number[];
  /** Read-only per-rift seal state for tests (no effect on gameplay). */
  rifts: { id: number; state: string; sealProgressMs: number }[];
}

declare global {
  interface Window {
    __riftLabDebug?: {
      snapshot: () => RiftLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      playNote: (color: PadColorName, hand?: 'left' | 'right') => void;
      spawnRift: () => void;
      /** Present only when a test opts in (sessionStorage iwsdk-rift-lab-test-controls=1).
       * false pauses the 6 s auto-spawn timer only. Default is on and it is reset to on
       * by Start and when the Lab deactivates. It never spawns, seals or charges. */
      setAutoSpawn?: (enabled: boolean) => void;
      sealFirstRift: () => void;
      /** Visual QA: pin the seal flight at progress 0..1 (null releases). */
      freezeSealProgress: (p: number | null) => void;
      /** Desktop-only visual QA: feed a synthetic hand (25 joint matrices,
       * grip world matrix) so the hand-shape orbit can be rendered. */
      setSyntheticHand: (
        hand: 'left' | 'right',
        joints: number[],
        grip: number[],
      ) => void;
      /** Experimental palm PointLight while sealing; toggle for MR washout. */
      setPalmLight: (on: boolean) => void;
      /** Visual QA: hold a mid-seal pose with the layered beam visible. */
      previewSeal: (progress?: number) => void;
    };
  }
}

interface RiftView {
  rift: Rift;
  group: Group;
  position: Vector3;
  born: number;
  fracture: ShaderMaterial;
  /** Thick neon notes + sharp sparks + luminous shards (replaces glow dots). */
  burst: PortalBurst;
  /** Fractional spark accumulator for the sealing spray (item 93). */
  sprayAcc: number;
}

/** Dedicated neon notes streaming hand→rift beside the beam while sealing. */
const TORRENT_COUNT = 32;

/**
 * Living four-color fracture (style D, his concept art): a dark void with a
 * jagged, animated edge whose quadrants take the four pad colors, a soft
 * glow halo, and a distortion shimmer. uOpen widens it as it tears open;
 * uSeal drives a film-melt close (uneven drip collapse) over the same hold
 * duration — visual only; sealing trigger/completion stay in game logic.
 * Normal blending (additive washed out on bright rooms, 14:38 check).
 */
const FRACTURE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRACTURE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uSeal;
uniform float uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
float hash(float n) { return fract(sin(n * 127.1 + uSeed * 31.7) * 43758.5453); }
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
float noise2(vec2 p) {
  return noise1(p.x * 1.7 + p.y * 13.1 + uSeed);
}
vec3 quadColor(float a) {
  // Green top-left, red top-right, yellow bottom-right, blue bottom-left
  // (the order in his style D concept), blended around the rim.
  float q = (a + 3.14159) / 6.28318 * 4.0;
  vec3 c = mix(uC0, uC1, smoothstep(0.7, 1.3, q));
  c = mix(c, uC2, smoothstep(1.7, 2.3, q));
  c = mix(c, uC3, smoothstep(2.7, 3.3, q));
  return mix(c, uC0, smoothstep(3.7, 4.0, q));
}
void main() {
  vec2 p = vec2(vUv.x * 1.1, vUv.y);
  float a = atan(p.y, p.x);
  float open = smoothstep(0.0, 1.0, uOpen);
  float seal = clamp(uSeal, 0.0, 1.0);

  // Base torn hole: taller than wide, ragged outline (forming/idle).
  float jag = 0.64 + 0.26 * noise1(a * 3.0 + 7.0)
                   + 0.10 * noise1(a * 9.0 + uTime * 1.2)
                   + 0.06 * noise1(a * 23.0 - uTime * 2.4);
  vec2 hp = vec2(p.x * 1.18, p.y * 0.86);
  float hr = length(hp);
  float baseEdge = 0.52 * jag * open;

  // Film-melt close: irregular threshold + gravity drip, not a uniform shrink.
  // Melting advances from the outer rim inward with hanging strands.
  float meltN = noise2(vec2(a * 2.4 + uTime * 0.35, hr * 6.0 + uSeed));
  meltN = 0.55 * meltN + 0.30 * noise2(vec2(a * 7.0 - uTime * 0.8, hr * 14.0))
        + 0.15 * noise2(vec2(a * 17.0, uTime * 1.4));
  // Bias so the top collapses earlier and material sags downward.
  float gravity = clamp(0.55 - p.y * 0.55, 0.0, 1.0);
  float meltField = meltN * 0.72 + gravity * 0.38;
  float meltThresh = mix(1.15, -0.05, seal);
  float melted = smoothstep(meltThresh - 0.18, meltThresh + 0.12, meltField);
  // Remaining hole radius: shrinks unevenly as melt eats the rim.
  float keep = mix(1.0, 0.08, seal * (0.55 + 0.45 * (1.0 - meltField)));
  float edge = baseEdge * keep * (1.0 - 0.72 * melted * seal);

  // Drip strands: neon blobs hanging below the surviving rim while sealing.
  float drip = 0.0;
  if (seal > 0.02) {
    float strand = noise1(a * 11.0 + 3.0);
    float dripLen = seal * (0.08 + 0.22 * strand);
    float rimY = edge * sin(a);
    // Soft hanging tendrils under the current rim.
    float along = clamp((rimY - p.y) / max(dripLen, 0.001), 0.0, 1.0);
    float nearX = exp(-abs(p.x - edge * cos(a) * 0.15) * 28.0);
    float bulb = exp(-pow((along - 0.85) / 0.12, 2.0));
    drip = nearX * smoothstep(0.0, 0.15, along) * (0.35 + 0.65 * bulb) * seal
         * step(p.y, rimY + 0.02);
  }

  float d = hr - edge;
  vec3 rim = quadColor(a);
  rim = mix(rim, vec3(1.0), 0.45 * seal + 0.25 * drip);

  // Radial cracks heal as the melt advances.
  float crack = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float n = 7.0 + fi * 5.0;
    float warp = (noise1(hr * (9.0 + fi * 4.0) + fi * 11.0) - 0.5) * (0.55 - fi * 0.12);
    float cell = fract((a + warp) / 6.28318 * n + hash(fi) );
    float dist = abs(cell - 0.5) * 6.28318 / n * hr;
    float width = 0.006 + 0.004 * (1.0 - fi * 0.3);
    float reach = (0.95 - fi * 0.15) * open * (1.0 - 0.85 * seal);
    float fade = step(edge, hr) * (1.0 - smoothstep(reach * 0.55, reach, hr)) * smoothstep(0.0, 0.05, hr - edge);
    float gate = step(0.5 + fi * 0.12, hash(floor((a + warp) / 6.28318 * n + hash(fi)) + fi * 5.0));
    crack += (exp(-dist / width) * 0.9 + exp(-dist / (width * 5.0)) * 0.25) * fade * gate;
  }
  crack *= (1.0 - 0.9 * seal);

  float flicker = 0.78 + 0.22 * noise1(a * 5.0 + uTime * 6.0);
  float line = exp(-abs(d) * 75.0) * flicker;
  // Molten rim band: thicker and hotter while sealing.
  float meltRim = exp(-abs(d) * mix(75.0, 28.0, seal)) * (0.55 + 1.6 * seal) * flicker;
  float halo = exp(-max(d, 0.0) * 9.0) * 0.5 * (1.0 - 0.35 * seal);
  float inside = 1.0 - smoothstep(-0.015, 0.015, d);

  vec3 voidCol = vec3(0.01, 0.01, 0.015);
  float star = step(0.995, hash(floor(hp.x * 36.0) + floor(hp.y * 36.0) * 57.0));
  voidCol += star * rim * 0.35 * inside;

  float scorch = exp(-max(d, 0.0) * 9.0) * 0.38 * (1.0 - 0.5 * seal) * open;
  float sealHot = meltRim + drip * 1.4;
  vec3 col = voidCol * inside + rim * (sealHot * 1.35 + crack * 1.2 + line * 0.6)
           + rim * halo * (0.6 + 0.7 * seal);
  col = mix(col, vec3(0.02, 0.02, 0.03), (1.0 - inside) * scorch);
  // Focal sealing glow + molten drip highlights.
  col += mix(rim, vec3(1.0), 0.55) * seal * exp(-hr * 3.2) * 0.5;
  col += rim * drip * 1.8;
  float alpha = clamp(inside * 0.96 + sealHot + halo * 0.8 + crack + scorch + drip, 0.0, 1.0);
  // Late seal: dissolve leftover alpha so completion clears cleanly.
  alpha *= 1.0 - smoothstep(0.88, 1.0, seal) * 0.92;
  float vig = 1.0 - smoothstep(0.82, 1.0, length(vUv));
  gl_FragColor = vec4(col, alpha * vig);
}`;

function buildFracture(rift: Rift): ShaderMaterial {
  const c = (i: number): Color => new Color(PAD_COLORS[rift.edgeColors[i]]);
  return new ShaderMaterial({
    vertexShader: FRACTURE_VERT,
    fragmentShader: FRACTURE_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uSeal: { value: 0 },
      uSeed: { value: rift.id * 3.7 },
      uC0: { value: c(0) },
      uC1: { value: c(1) },
      uC2: { value: c(2) },
      uC3: { value: c(3) },
    },
  });
}

export class RiftLabSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private readonly game = new RiftLabGame();
  private panel: UIKitMLAsset | null = null;
  private readonly panelScale = new Vector3();
  private readonly panelCorner = new Vector3();
  private readonly panelRect = new Vector4();
  private flatCheckAt = 0;
  private statusText: UIKit.Text | null = null;
  private energyText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private active = false;
  private running = false;
  /** Gameplay encounter drive: active inside Wall Tones mode while the
   * three-portal encounter runs (owner-settled rules in rift-encounter.ts). */
  private encounterLive = false;
  private lastMode = 'menu';
  private lastSpawnAt = 0;
  /** Debug-bridge opt-in only; always false in normal play. */
  private autoSpawnPaused = false;
  private readonly root = new Group();
  private readonly noteMeshes = new Map<number, Mesh>();
  /** Separate from charge-orbit notes: beam-corridor sealing torrent. */
  private readonly torrentMeshes: Mesh[] = [];
  private readonly torrentSeeds = new Float32Array(TORRENT_COUNT * 4);
  private readonly riftViews = new Map<number, RiftView>();
  private dragging = false;
  private flatTouchInput = false;
  private fingerDown = false;
  private readonly touchOrbPoint = new Vector3();
  private readonly glowCamPos = new Vector3();
  private readonly pointerNotePlane = new Plane(new Vector3(0, 0, 1), 1.4);
  /** Low horizontal shelf the resting touch orb hovers on (y = shelf). */
  private readonly touchOrbShelfPlane = new Plane(
    new Vector3(0, 1, 0),
    -TOUCH_ORB_SHELF_Y_M,
  );
  private readonly pointerNoteAnchor = new Vector3();
  /** Scratch for flat-touch beam soft-lock / plane aim (no per-frame alloc). */
  private readonly touchBeamTarget = new Vector3();
  private readonly touchRiftNdc = new Vector3();
  private dragStart = { x: 0, y: 0 };
  private aimNdc = { x: 0, y: 0 };
  /** False until the pointer moves: default NDC (0,0) parked a Start-energy
   * note/aura ball dead-center in front of the camera. */
  private aimHasMoved = false;
  private lastUiUpdate = 0;
  private statusMessage = 'Press Start. Successful notes charge your hands.';
  /** Live XR palm poses per hand, refreshed each update; null when flat or
   * the hand is untracked. */
  private readonly palms: Record<'left' | 'right', PalmPose | null> = {
    left: null,
    right: null,
  };
  /** True while the active beam was opened by an XR open palm (so only XR
   * logic stops it on palm close / tracking loss). */
  private xrBeamActive = false;
  private sealBeam: RiftSealBeam | null = null;
  private handAura: RiftHandAura | null = null;
  private handOccluders: RiftHandOccluders | null = null;
  private readonly beamEnd = new Vector3();
  private readonly beamHitPoint = new Vector3();
  private readonly noteOccPalm = new Vector3();
  private readonly noteOccCam = new Vector3();
  private readonly noteOccNote = new Vector3();
  private beamTimeSec = 0;
  /** Item 93: shared world-space spark pool with room-geometry collision. */
  private readonly geoPool: GeometryParticlePool =
    createGeometryParticlePool(GEO_POOL_MAX);
  private geoSparkDraw: ReturnType<typeof createGeoSparkDraw> | null = null;
  private readonly beamCaster = new Raycaster();
  private readonly beamTargets: Object3D[] = [];
  private readonly meshWalk: Object3D[] = [];
  private readonly beamMeshPoint = new Vector3();
  private readonly beamMeshNormal = new Vector3();
  private readonly surfaceHit: SurfaceRayHit = {
    t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0,
  };
  private readonly geoSurfaces: CollisionSurface[] = [];
  /** Beam stop surfaces: room + rift-host only. Synthetic ground stays in
   * `geoSurfaces` for spark bounce but must not kill a low mobile orb beam
   * (or a Quest unbounded beam at head-height y=0). */
  private readonly beamSurfaces: CollisionSurface[] = [];
  private lastGeoSurfaceRefreshAt = 0;
  private beamHitSprayAcc = 0;
  private readonly geoScratchNormal = new Vector3();
  /** World camera orientation for billboarded portal / welding sparks. */
  private readonly cameraWorldQuat = new Quaternion();
  private readonly geoScratchOrigin = new Vector3();
  private readonly geoScratchU = new Vector3();
  private readonly geoScratchV = new Vector3();
  private readonly geoHitPoint = new Vector3();
  private readonly geoColors = Object.fromEntries(
    Object.entries(PAD_COLORS).map(([name, css]) => {
      const c = new Color(css);
      return [name, [c.r, c.g, c.b] as [number, number, number]];
    }),
  ) as Record<PadColorName, [number, number, number]>;
  private experimentPalmLight = EXPERIMENT_PALM_LIGHT;
  /** Optional forced beam origin for visual QA (keeps the beam from collapsing). */
  private debugBeamOrigin: Vector3 | null = null;
  private readonly debugBeamOriginScratch = new Vector3(0.25, 1.25, -0.35);
  private readonly palmAnchorLeft = new Vector3();
  private readonly palmAnchorRight = new Vector3();
  private readonly headPos = new Vector3();
  private debugSealP: number | null = null;
  private readonly debugHands: Record<'left' | 'right', PalmPose | null> = {
    left: null,
    right: null,
  };
  private readonly shapePoint: [number, number, number] = [0, 0, 0];
  private readonly shapeDir: [number, number, number] = [0, 0, 0];
  private readonly desktopRay = new Raycaster();
  private readonly desktopNdc = new Vector2();
  private readonly flatInputPlane = new Plane(new Vector3(0, 0, 1), 2.5);
  private readonly flatInputPoint = new Vector3();
  private readonly planeScratch: Entity[] = [];
  private roomCaptureAttempted = false;
  private awaitingWalls = false;
  private mrButton: unknown = null;

  init(): void {
    this.root.visible = false;
    try {
      this.sealBeam = new RiftSealBeam();
      this.handAura = new RiftHandAura();
      this.handOccluders = new RiftHandOccluders();
      this.root.add(this.sealBeam.root);
      this.root.add(this.handAura.root);
      this.root.add(this.handOccluders.root);
      this.geoSparkDraw = createGeoSparkDraw(GEO_POOL_MAX);
      this.root.add(this.geoSparkDraw.mesh);
      for (let i = 0; i < TORRENT_COUNT; i++) {
        const color = PAD_COLOR_NAMES[i % PAD_COLOR_NAMES.length];
        const mesh = new Mesh(
          new PlaneGeometry(NOTE_SIZE_M * 2.1, NOTE_SIZE_M * 2.1),
          noteGlyphMaterial(color).clone(),
        );
        mesh.visible = false;
        mesh.frustumCulled = false;
        this.torrentMeshes.push(mesh);
        this.root.add(mesh);
        this.torrentSeeds[i * 4] = Math.random();
        this.torrentSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
        this.torrentSeeds[i * 4 + 2] = 0.55 + Math.random() * 0.9;
        this.torrentSeeds[i * 4 + 3] = 0.06 + Math.random() * 0.1;
      }
    } catch (error) {
      console.warn('[rift-lab] seal visual layers failed to construct', error);
    }
    this.world.scene.add(this.root);
    // Install the debug bridge before the panel gate so visual QA can still
    // drive the Lab when scene lookup races or the panel bind is delayed.
    this.installDebugBridge();
    this.panel = this.world.getSceneObject<UIKitMLAsset>('rift-lab-panel') ?? null;
    if (this.panel == null) {
      console.warn('[rift-lab] rift-lab-panel scene object missing');
      return;
    }
    const panel = this.panel;
    this.statusText = panel.getElementById<UIKit.Text>('rift-lab-status');
    this.energyText = panel.getElementById<UIKit.Text>('rift-lab-energy');
    this.telemetryText = panel.getElementById<UIKit.Text>('rift-lab-telemetry');

    panel
      .getElementById('rift-lab-start-button')
      ?.addEventListener('click', () => this.startRun());
    // Stand-in for main-game successful notes until integration (Lab-only).
    panel
      .getElementById('rift-lab-note-button')
      ?.addEventListener('click', () => this.playNote());
    // Back stops the run here; AppModeSystem owns the mode swap back to the
    // Lab menu (bound on the same button, like the other Back buttons).
    panel
      .getElementById('rift-lab-back-button')
      ?.addEventListener('click', () => this.stopRun());
    this.mrButton = panel.getElementById('rift-lab-mr-button');
    panel
      .getElementById('rift-lab-mr-button')
      ?.addEventListener('click', () => this.enterMixedReality());

    const canvas = this.world.renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (!this.active || !this.running) return;
      this.flatTouchInput = event.pointerType === 'touch';
      this.fingerDown = false;
      const bounds = canvas.getBoundingClientRect();
      this.aimNdc = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      };
      const fracX = event.clientX / window.innerWidth;
      const fracY = event.clientY / window.innerHeight;
      let nearChargeSpot: boolean;
      if (this.flatTouchInput) {
        // Touch: only a press that lands on the visible resting orb starts the
        // drag. Anywhere else must not move the orb or its glow.
        this.world.camera.updateMatrixWorld();
        const orb = this.restingOrbPoint(this.touchOrbPoint.clone()).project(
          this.world.camera,
        );
        const orbX = bounds.left + ((orb.x + 1) / 2) * bounds.width;
        const orbY = bounds.top + ((1 - orb.y) / 2) * bounds.height;
        nearChargeSpot =
          Math.hypot(event.clientX - orbX, event.clientY - orbY) <=
          TOUCH_ORB_GRAB_RADIUS_PX;
        this.fingerDown = nearChargeSpot;
      } else {
        nearChargeSpot = fracY >= CHARGE_SPOT_Y_FRAC - 0.08 &&
          Math.abs(fracX - 0.5) <= CHARGE_SPOT_X_TOL_FRAC;
      }
      if (nearChargeSpot) {
        // Mobile/flat: drag from the fixed charge spot aims and fires.
        this.dragging = true;
        this.dragStart = { x: fracX, y: fracY };
        this.game.startBeam({ kind: 'mobile-drag', dx: 0, dy: 0 });
      } else {
        // Desktop (settled 13:38): click the rift itself with enough energy;
        // notes fly pointer-to-rift and it seals. No hold duration.
        // Use the rendered camera projection, not a linear world-coordinate
        // approximation: a visible rift must be clickable at its actual pixel.
        const rect = canvas.getBoundingClientRect();
        this.desktopNdc.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.world.camera.updateMatrixWorld();
        this.desktopRay.setFromCamera(this.desktopNdc, this.world.camera);
        const panelPoint = this.desktopRay.ray.intersectPlane(
          this.flatInputPlane, this.flatInputPoint,
        );
        // UI interaction must never seal a rift behind the panel.
        if (panelPoint != null && isOverLabPanel(panelPoint)) return;
        let best: RiftView | null = null;
        let bestDist = BEAM_HIT_RADIUS_M;
        for (const view of this.riftViews.values()) {
          const d = this.desktopRay.ray.distanceToPoint(view.position);
          if (d <= bestDist) {
            best = view;
            bestDist = d;
          }
        }
        if (best != null) {
          const fired = this.game.pcClickRift(best.rift.id);
          if (!fired) void playSealDenied(best.position);
          this.renderPanel(
            fired
              ? 'Notes fly to the rift.'
              : `Not enough energy (need ${SEAL_ENERGY_REQUIRED}).`,
          );
        }
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      this.flatTouchInput = event.pointerType === 'touch';
      const bounds = canvas.getBoundingClientRect();
      this.aimNdc = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      };
      this.aimHasMoved = true;
    };
    const onPointerUp = () => {
      this.fingerDown = false;
      if (this.dragging) {
        this.dragging = false;
        this.game.stopBeam();
      }
    };
    // Touch drags must reach us as pointer moves: without touch-action none
    // the browser claims the gesture and the drag never follows the finger.
    const prevTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail.mode;
      this.lastMode = mode;
      this.setActive(mode === 'riftlab');
      this.syncEncounterDrive();
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.lastMode = window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu';
    this.setActive(this.lastMode === 'riftlab');

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.style.touchAction = prevTouchAction;
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      this.world.scene.remove(this.root);
      delete window.__riftLabDebug;
    });

    this.renderPanel('Press Start. Successful notes charge your hands.');
  }

  private testControlsOptedIn(): boolean {
    try {
      return sessionStorage.getItem('iwsdk-rift-lab-test-controls') === '1';
    } catch {
      return false;
    }
  }

  private installDebugBridge(): void {
    window.__riftLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.debugEnterLab(),
      start: () => this.startRun(),
      playNote: (color, hand) => this.playNote(color, hand),
      spawnRift: () => this.spawnRift(),
      ...(this.testControlsOptedIn()
        ? {
            setAutoSpawn: (enabled: boolean) => {
              this.autoSpawnPaused = !enabled;
            },
          }
        : {}),
      sealFirstRift: () => this.debugSealFirstRift(),
      freezeSealProgress: (p) => {
        this.debugSealP = p;
      },
      setSyntheticHand: (hand, joints, grip) => {
        this.debugHands[hand] = readPalmPose(
          new Float32Array(joints),
          grip,
        );
      },
      setPalmLight: (on: boolean) => {
        this.experimentPalmLight = on;
      },
      previewSeal: (progress) => this.debugPreviewSeal(progress ?? 0.55),
    };
  }

  /** Visual QA entry: show the Lab panel chrome and hide the main menu. */
  private debugEnterLab(): void {
    const show = (id: string, visible: boolean) => {
      const entity = this.world.getSceneEntity(id);
      if (entity == null) return;
      entity.setValue(Visibility, 'isVisible', visible);
      if (visible && !entity.hasComponent(RayInteractable)) {
        entity.addComponent(RayInteractable);
      } else if (!visible && entity.hasComponent(RayInteractable)) {
        entity.removeComponent(RayInteractable);
      }
    };
    show('main-menu-panel', false);
    show('lab-entry-panel', false);
    show('lab-menu-panel', false);
    show('wall-tones-panel', false);
    show('rift-lab-panel', true);
    try {
      window.sessionStorage.setItem('iwsdk-experience-mode', 'riftlab');
    } catch {
      // sessionStorage can throw in locked-down embeds.
    }
    window.dispatchEvent(
      new CustomEvent('experience-mode-changed', { detail: { mode: 'riftlab' } }),
    );
    this.setActive(true);
  }

  private setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.visible = active;
    if (!active) {
      this.autoSpawnPaused = false;
      this.stopRun();
    } else {
      this.renderPanel('Press Start. Successful notes charge your hands.');
    }
  }

  /** Mixed reality = an immersive session that shows the real room. */
  private isMixedReality(): boolean {
    if (!this.isImmersive()) return false;
    const blend = (this.world.session as XRSession | null | undefined)
      ?.environmentBlendMode;
    return blend != null && blend !== 'opaque';
  }

  private currentWalls() {
    this.planeScratch.length = 0;
    for (const entity of this.queries.planes.entities) {
      this.planeScratch.push(entity);
    }
    this.player.head.getWorldPosition(this.headPos);
    return collectVerticalWalls(this.planeScratch, this.headPos);
  }

  /** Coarse-pointer phone/tablet: touch layout even before the first touch. */
  private touchDevice(): boolean {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  private startRun(): void {
    if (this.isImmersive() && !this.isMixedReality()) {
      // A passthrough-free VR session cannot show rifts on real walls.
      this.renderPanel(
        'Rift Lab needs mixed reality, not VR. Press Enter mixed reality below.',
      );
      return;
    }
    this.running = true;
    this.autoSpawnPaused = false;
    // Fresh Start: don't inherit a stale center-aim from a previous hover.
    this.aimHasMoved = false;
    // One full seal's worth of charge ready at start (owner ask 2026-11-17).
    this.game.setStartingEnergy(SEAL_ENERGY_REQUIRED);
    this.lastSpawnAt = performance.now();
    if (this.isMixedReality()) {
      this.roomCaptureAttempted = false;
      this.awaitingWalls = true;
      this.renderPanel('Looking for your real walls...');
      this.trySpawnOnWalls();
      return;
    }
    this.spawnRift();
    if (this.riftViews.size === 0) {
      this.renderPanel('Making room for a rift...');
      return;
    }
    // Start already grants one seal of energy — surface the Ready copy that
    // playNote would show after charging, not the empty-hands charge prompt.
    this.renderPanel(
      this.game.canFireBeam()
        ? this.flatTouchInput || this.touchDevice()
          ? 'Ready. Tap a rift, or drag the orb from the corner to a rift.'
          : 'Ready. Click a rift, or aim an open palm in XR.'
        : 'A rift is open. Charge up and seal it.',
    );
  }


  /** MR: rifts only open on detected real walls. Ask Quest for room capture
   * once when none are known; never fall back to pretend walls. */
  private trySpawnOnWalls(): void {
    if (this.currentWalls().length > 0) {
      this.awaitingWalls = false;
      this.spawnRift();
      return;
    }
    const session = this.world.session as
      | (XRSession & { initiateRoomCapture?: () => Promise<undefined> })
      | null
      | undefined;
    if (
      !this.roomCaptureAttempted &&
      typeof session?.initiateRoomCapture === 'function'
    ) {
      this.roomCaptureAttempted = true;
      this.renderPanel('No walls found yet. Opening room capture...');
      void session.initiateRoomCapture().catch((error: unknown) => {
        console.warn('[rift-lab] room capture failed', error);
        this.renderPanel(
          'No real walls detected. Scan your room in Quest space setup, then press Start again.',
        );
      });
      return;
    }
    if (this.roomCaptureAttempted) return; // keep waiting for planes to arrive
    this.renderPanel(
      'No real walls detected. Scan your room in Quest space setup, then press Start again.',
    );
  }

  /** A spot on a real detected wall, at reachable height, facing the room. */
  private pickWallSpot(preferFrontWall = false): { position: Vector3; normal: Vector3 } | null {
    const walls = this.currentWalls();
    if (walls.length === 0) return null;
    const existing = [...this.riftViews.values()].map((v) => v.position);
    const crowd = (w: (typeof walls)[number]) =>
      existing.filter((p) => p.distanceTo(new Vector3(w.center.x, p.y, w.center.z)) < 1.5).length;
    // Encounter rule (his words): portals go on the wall in front of the
    // player when possible - the wall holding the pads. Crowding on that
    // wall still yields to another wall rather than stacking portals.
    const pref = preferFrontWall ? riftEncounter.getPreferredWallPosition() : null;
    const prefDist = (w: (typeof walls)[number]) =>
      pref == null
        ? 0
        : Math.hypot(w.center.x - pref.x, w.center.z - pref.z);
    const ordered = [...walls].sort(
      (a, b) => crowd(a) - crowd(b) || prefDist(a) - prefDist(b),
    );
    for (const wall of ordered) {
      const object = wall.entity.object3D;
      if (object == null) continue;
      object.updateWorldMatrix(true, false);
      const spanX = wall.localMaxX - wall.localMinX;
      const spanZ = wall.localMaxZ - wall.localMinZ;
      const insetX = Math.min(WALL_RIFT_INSET_M, spanX / 2);
      const insetZ = Math.min(WALL_RIFT_INSET_M, spanZ / 2);
      for (let attempt = 0; attempt < 30; attempt++) {
        const lx = wall.localMinX + insetX + Math.random() * Math.max(0, spanX - 2 * insetX);
        const lz = wall.localMinZ + insetZ + Math.random() * Math.max(0, spanZ - 2 * insetZ);
        const world = object.localToWorld(new Vector3(lx, 0, lz));
        if (
          world.y < this.headPos.y - WALL_RIFT_BAND_BELOW_M ||
          world.y > this.headPos.y + WALL_RIFT_BAND_ABOVE_M
        ) {
          continue;
        }
        if (existing.some((p) => p.distanceTo(world) < WALL_RIFT_SPACING_M)) continue;
        const normal = new Vector3(wall.normal.x, wall.normal.y, wall.normal.z);
        return {
          position: world.add(normal.clone().multiplyScalar(WALL_RIFT_OFFSET_M)),
          normal,
        };
      }
    }
    return null;
  }

  private enterMixedReality(): void {
    if (this.isMixedReality()) return;
    const wasImmersive = this.isImmersive();
    void import('../wall-tones/world-host.js')
      .then(async (host) => {
        if (wasImmersive) {
          try {
            this.world.exitXR();
          } catch {
            // The VR session may already be ending.
          }
        }
        // Boots the mixed-reality world straight back into this Lab and shows
        // the tap-to-enter gate (a session needs a real tap).
        await host.switchToWallTonesArWorld('riftlab');
      })
      .catch((error) => {
        console.warn('[rift-lab] mixed reality switch failed', error);
        this.renderPanel('Could not open mixed reality. Try the main menu Enter XR.');
      });
  }

  private stopRun(): void {
    this.running = false;
    this.awaitingWalls = false;
    stopBeamHum();
    stopAllRiftAmbience();
    this.dragging = false;
    this.xrBeamActive = false;
    this.debugBeamOrigin = null;
    this.debugSealP = null;
    this.beamHitSprayAcc = 0;
    this.sealBeam?.update({
      origin: this.beamEnd,
      end: this.beamEnd,
      hitStrength: 0,
      timeSec: this.beamTimeSec,
      visible: false,
    });
    this.clearGeometryParticles();
    this.game.stopBeam();
    for (const id of [...this.riftViews.keys()]) {
      this.removeRiftView(id);
    }
    this.game.clearSealed();
  }

  private playNote(color?: PadColorName, hand?: 'left' | 'right'): void {
    const picked =
      color ?? PAD_COLOR_NAMES[Math.floor(Math.random() * PAD_COLOR_NAMES.length)];
    this.game.addNoteEnergy(picked, hand);
    void playNoteChime(picked, hand != null ? this.handAnchor(hand) : undefined);
    this.renderPanel(this.game.canFireBeam()
      ? this.flatTouchInput || this.touchDevice()
        ? 'Ready. Tap a rift, or drag the orb from the corner to a rift.'
        : 'Ready. Click a rift, or aim an open palm in XR.'
      : `Charge: ${Math.round(this.game.getEnergy())}/${SEAL_ENERGY_REQUIRED}.`);
  }

  /** Lab panel screen rect in NDC (approximate, from its scale). */
  private panelNdcRect(out: Vector4, target: unknown = this.panel): boolean {
    const obj = target as import('three').Object3D | null;
    if (obj == null) return false;
    obj.updateWorldMatrix(true, false);
    const sc = obj.getWorldScale(this.panelScale).x;
    const hw = 2.9 * sc;
    const hh = 2.79 * sc;
    let minX = 9, minY = 9, maxX = -9, maxY = -9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      this.panelCorner.set((sx * hw) / sc, (sy * hh) / sc, 0).applyMatrix4(obj.matrixWorld).project(this.world.camera);
      minX = Math.min(minX, this.panelCorner.x);
      maxX = Math.max(maxX, this.panelCorner.x);
      minY = Math.min(minY, this.panelCorner.y);
      maxY = Math.max(maxY, this.panelCorner.y);
    }
    out.set(minX, minY, maxX, maxY);
    return true;
  }

  /** Same predicate as WallTonesSystem.isPhoneFlatViewport. */
  private isPhoneFlatViewport(): boolean {
    if (typeof window === 'undefined') return false;
    const width = window.innerWidth;
    const height = window.innerHeight;
    return width <= 480 || (height <= 480 && width <= 950);
  }

  /** Flat keep-out rects a rift must never slide under. During the
   * gameplay encounter the live Wall Tones HUD is the panel that can cover
   * a portal (his Nov 19 playtest note: rifts rendering behind the panel);
   * the Lab panel's footprint still applies as the desktop pad-grid
   * keep-out even while the Lab panel itself is hidden. */
  private flatKeepOutRects(): Vector4[] {
    const rects: Vector4[] = [];
    // Phone flat portrait: the HUD rides close and high (PHONE_PANEL_FLAT),
    // so its projected rect spans the whole portrait screen and keeping
    // rifts out of it leaves NO legal spawn spot (his Nov 20 report: seam
    // line played, no portals on iPhone). The portrait right-half rule and
    // the bottom-left orb bias already keep rifts visually clear of the
    // phone HUD, so the HUD keep-out is desktop-only.
    if (this.encounterLive && !this.isPhoneFlatViewport()) {
      const hudRect = new Vector4();
      if (this.panelNdcRect(hudRect, this.world.getSceneObject('wall-tones-panel'))) {
        rects.push(hudRect);
      }
    }
    if (this.panelNdcRect(this.panelRect)) rects.push(this.panelRect.clone());
    return rects;
  }

  /** True if a rift of this radius at pos would leave the screen or touch a keep-out. */
  private flatSpotBlocked(pos: Vector3, radius: number, keepOut: Vector4[]): boolean {
    const cam = this.world.camera;
    const a = new Vector3().copy(pos).project(cam);
    if (a.z > 1) return true;
    const b = new Vector3(pos.x + radius, pos.y + radius, pos.z).project(cam);
    const rx = Math.abs(b.x - a.x);
    const ry = Math.abs(b.y - a.y);
    if (a.x - rx < -0.95 || a.x + rx > 0.95 || a.y - ry < -0.95 || a.y + ry > 0.95) return true;
    for (const r of keepOut) {
      const M = 0.06;
      const dx = Math.max(r.x - M - (a.x + rx), a.x - rx - (r.z + M), 0);
      const dy = Math.max(r.y - M - (a.y + ry), a.y - ry - (r.w + M), 0);
      if (dx <= 0 && dy <= 0) return true;
    }
    return false;
  }

  /**
   * Desktop rift placement for the CURRENT camera/viewport: biggest radius
   * first, on screen, clear of the Lab panel and of other open rifts. Returns
   * null when nothing fits (caller defers).
   */
  private pickFlatSpot(
    excludeId: number | null,
  ): { pos: Vector3; radius: number } | null {
    const depth = RIFT_POSITIONS[0]!.z;
    this.world.camera.updateMatrixWorld();
    const keepOut = this.flatKeepOutRects();
    const others: { pos: Vector3; radius: number }[] = [];
    for (const [id, v] of this.riftViews) {
      if (id === excludeId) continue;
      others.push({ pos: v.position, radius: v.group.scale.x * RIFT_VISIBLE_RADIUS_M });
    }
    for (const radius of FLAT_RIFT_RADII_M) {
      const good: { pos: Vector3; score: number }[] = [];
      for (let x = -3.2; x <= 3.201; x += 0.2) {
        for (let y = radius * 1.15 + 0.05; y <= 3.5; y += 0.1) {
          const pos = new Vector3(x, y, depth);
          if (this.flatSpotBlocked(pos, radius, keepOut)) continue;
          let near = Infinity;
          let ok = true;
          for (const o of others) {
            const d = o.pos.distanceTo(pos);
            if (d < (radius + o.radius) * 1.1) { ok = false; break; }
            near = Math.min(near, d);
          }
          if (!ok) continue;
          // Portrait/touch layout: prefer the bottom-right, away from the
          // bottom-left orb (mockup 6).
          const ndcP = new Vector3().copy(pos).project(this.world.camera);
          const portrait = this.world.camera.aspect < 1;
          // Portrait: rifts stay in the right half, opposite the bottom-left orb.
          if (portrait && ndcP.x < 0.05) continue;
          const bias = portrait
            ? -Math.hypot(ndcP.x - 0.55, ndcP.y + 0.55) * 1.5
            : 0;
          good.push({ pos, score: Math.min(near, 3) + bias });
        }
      }
      if (good.length > 0) {
        good.sort((m, n) => n.score - m.score);
        const top = good.slice(0, Math.max(1, Math.ceil(good.length / 4)));
        return { pos: top[Math.floor(Math.random() * top.length)]!.pos.clone(), radius };
      }
    }
    return null;
  }

  /** Flat mode: if a resize or menu move put an open rift over the menu or off
   * screen, move or shrink it; if nothing fits it is discarded (never left clipped). */
  private reflowFlatRifts(): void {
    if (this.isImmersive() || this.riftViews.size === 0) return;
    const now = performance.now();
    if (now - this.flatCheckAt < 400) return;
    this.flatCheckAt = now;
    this.world.camera.updateMatrixWorld();
    const keepOut = this.flatKeepOutRects();
    for (const [id, v] of this.riftViews) {
      const radius = v.group.scale.x * RIFT_VISIBLE_RADIUS_M;
      if (!this.flatSpotBlocked(v.position, radius, keepOut)) continue;
      const spot = this.pickFlatSpot(id);
      if (spot == null) {
        // Nowhere safe on this viewport: drop the open rift rather than leave
        // it clipped or over the menu. The spawn timer brings one back when a
        // spot exists again.
        if (this.game.discardRift(id)) this.removeRiftView(id);
        continue;
      }
      v.position.copy(spot.pos);
      v.group.position.copy(spot.pos);
      v.group.scale.setScalar(spot.radius / RIFT_VISIBLE_RADIUS_M);
    }
  }

  private spawnRift(preferFrontWall = false): void {
    if (this.riftViews.size >= MAX_OPEN_RIFTS) return;
    let wallSpot: { position: Vector3; normal: Vector3 } | null = null;
    if (this.isImmersive()) {
      // MR: only on real detected walls. No wall spot means no rift: pretend
      // walls would misstate what this Lab is testing.
      wallSpot = this.isMixedReality() ? this.pickWallSpot(preferFrontWall) : null;
      if (wallSpot == null) return;
    }
    // Flat mode: a spot clear of the menu and of other rifts, or defer (the
    // spawn timer retries). Never place a rift over the menu or another rift.
    const flatSpot = wallSpot == null ? this.pickFlatSpot(null) : null;
    if (wallSpot == null && flatSpot == null) return;
    const rift = this.game.spawnRift();
    const position = wallSpot != null ? wallSpot.position : flatSpot!.pos;
    const lookTarget: Vector3 | null =
      wallSpot != null ? wallSpot.position.clone().add(wallSpot.normal) : null;
    void playRiftOpen(position);
    startRiftAmbience(rift.id, position);
    const group = new Group();
    // Living four-color fracture: shader void/edge plus drifting note sparks.
    const fracture = buildFracture(rift);
    const quad = new Mesh(new PlaneGeometry(RIFT_PLANE_M, RIFT_PLANE_M), fracture);
    group.add(quad);
    // Portal cloud: thick neon notes, sharp sparks, luminous shards.
    // Replaces blurry glow dots / flat sprites / rock chips. Idle only —
    // sealing beam is a separate path and must not appear on idle rifts.
    const burst = createPortalBurst(rift.id, rift.edgeColors);
    group.add(burst.root);
    group.position.copy(position);
    if (flatSpot != null) group.scale.setScalar(flatSpot.radius / RIFT_VISIBLE_RADIUS_M);
    if (lookTarget != null) {
      group.lookAt(lookTarget);
    }
    this.root.add(group);
    this.riftViews.set(rift.id, {
      rift,
      group,
      position,
      born: performance.now(),
      fracture,
      burst,
      sprayAcc: 0,
    });
    this.renderPanel();
  }

  private removeRiftView(id: number): void {
    const view = this.riftViews.get(id);
    if (view == null) return;
    disposePortalBurst(view.burst);
    stopRiftAmbience(id);
    this.root.remove(view.group);
    this.riftViews.delete(id);
  }

  private isImmersive(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Refresh live palm poses from the hand-tracking adapters. No-ops to
   * nulls when flat or untracked, so flat input paths are untouched. */
  private updateXrHands(): void {
    if (!this.isImmersive()) {
      this.palms.left = this.debugHands.left;
      this.palms.right = this.debugHands.right;
      return;
    }
    for (const hand of ['right', 'left'] as const) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter instanceof XRHandVisualAdapter) {
        const grip = this.player.gripSpaces[hand];
        grip.updateWorldMatrix(true, false);
        this.palms[hand] = readPalmPose(
          adapter.jointTransforms,
          grip.matrixWorld.elements,
        );
      } else {
        this.palms[hand] = null;
      }
    }
  }

  /** Open-palm beam control (his 12:15 input): an open palm with enough
   * energy starts the beam; closing the hand or losing tracking stops it.
   * Only the active firing/dominant hand can start it — a closed right hand
   * plus an open left was blinking because hold checked firingHand while
   * start used whichever palm was open. */
  private updateXrBeam(): void {
    if (this.palms.left == null && this.palms.right == null) {
      if (this.xrBeamActive) {
        this.xrBeamActive = false;
        this.game.stopBeam();
        if (this.game.openRiftModifierActive()) {
          this.renderPanel('A rift is open. Charge up and seal it.');
        }
      }
      return;
    }
    if (this.xrBeamActive) {
      const beamHand = this.game.getBeamHand() ?? this.game.getFiringHand();
      const palm = this.palms[beamHand];
      if (palm == null || !palm.holdOpen) {
        this.xrBeamActive = false;
        this.game.stopBeam();
        if (this.game.openRiftModifierActive()) {
          this.renderPanel('A rift is open. Charge up and seal it.');
        }
      }
      return;
    }
    if (this.game.isBeamActive()) {
      return; // a flat (drag) beam is already running
    }
    // Dominant / firing hand only: the other open palm must not start a beam.
    const hand = this.game.getFiringHand();
    const palm = this.palms[hand];
    if (palm != null && palm.open && this.game.canFireBeam()) {
      this.xrBeamActive = this.game.startBeam({
        kind: 'xr-open-palm',
        hand,
      });
      if (this.xrBeamActive) {
        this.renderPanel('Palm beam firing. Aim at a rift.');
      }
    }
  }

  private pxPerMeterAt(anchor: Vector3): number {
    const cam = this.world.camera as unknown as { fov?: number };
    const fov = ((cam.fov ?? 60) * Math.PI) / 180;
    const dist = anchor.distanceTo(this.world.camera.getWorldPosition(this.glowCamPos));
    return window.innerHeight / (2 * dist * Math.tan(fov / 2));
  }

  /** While a finger drags the orb on a touch screen, grow the note cloud so
   * its on-screen radius is TOUCH_GLOW_RADIUS_PX (fingertip + 50%) and the
   * finger no longer hides it. 1 otherwise (XR, desktop, resting orb). */
  private fingertipGlowScale(anchor: Vector3): number {
    if (this.isImmersive() || !this.flatTouchInput || !this.fingerDown) return 1;
    const cam = this.world.camera as unknown as { fov?: number };
    const fov = ((cam.fov ?? 60) * Math.PI) / 180;
    const dist = anchor.distanceTo(this.world.camera.getWorldPosition(this.glowCamPos));
    const worldPerPx = (2 * dist * Math.tan(fov / 2)) / window.innerHeight;
    const target = TOUCH_GLOW_RADIUS_PX * worldPerPx;
    return Math.max(1, target / (CLOUD_MAX_RADIUS_M * 1.12));
  }

  /** World point of the resting touch orb: the bottom-left corner ray
   * dropped onto a low shelf just above the floor, so the visible orb sits
   * in the corner where the drag starts (clamping it on the note plane
   * floated it mid-screen, away from the actual touch zone). */
  private restingOrbPoint(out: Vector3): Vector3 {
    this.desktopNdc.set(TOUCH_ORB_NDC.x, TOUCH_ORB_NDC.y);
    this.world.camera.updateMatrixWorld();
    this.desktopRay.setFromCamera(this.desktopNdc, this.world.camera);
    if (this.desktopRay.ray.intersectPlane(this.touchOrbShelfPlane, out)) {
      return out;
    }
    // The corner ray never reaches the shelf (camera pitched up): fall back
    // to the note plane, kept above the floor.
    if (this.desktopRay.ray.intersectPlane(this.pointerNotePlane, out)) {
      if (out.y < TOUCH_ORB_SHELF_Y_M) out.y = TOUCH_ORB_SHELF_Y_M;
      return out;
    }
    return out.set(-0.55, TOUCH_ORB_SHELF_Y_M, -1.2);
  }

  private handAnchor(hand: 'left' | 'right'): Vector3 {
    const palm = this.palms[hand];
    if (palm != null) {
      const scratch =
        hand === 'right' ? this.palmAnchorRight : this.palmAnchorLeft;
      return scratch.set(palm.center[0], palm.center[1], palm.center[2]);
    }
    // Immersive: never fall back to the flat desktop world anchors. Those
    // sit near session start and parked the Start-energy cloud as a mid-air
    // sphere while the live hand looked empty.
    if (this.isImmersive()) {
      const other = hand === 'right' ? this.palms.left : this.palms.right;
      if (other != null) {
        const scratch =
          hand === 'right' ? this.palmAnchorRight : this.palmAnchorLeft;
        return scratch.set(other.center[0], other.center[1], other.center[2]);
      }
      this.player.head.getWorldPosition(this.headPos);
      const scratch =
        hand === 'right' ? this.palmAnchorRight : this.palmAnchorLeft;
      return scratch.copy(this.headPos);
    }
    if (!this.isImmersive() && (this.flatTouchInput || this.touchDevice())) {
      // Touch: notes rest on the bottom-left corner orb and follow the
      // finger while it is down, like the desktop notes follow the mouse.
      if (!this.fingerDown) {
        return this.restingOrbPoint(this.touchOrbPoint);
      }
      this.desktopNdc.set(this.aimNdc.x, this.aimNdc.y);
      this.world.camera.updateMatrixWorld();
      this.desktopRay.setFromCamera(this.desktopNdc, this.world.camera);
      // A fixed distance along the finger ray keeps the cloud in front of the
      // viewer. The far note plane put it under the floor near the screen
      // bottom (the opaque floor hid it while the finger rested on the orb).
      this.desktopRay.ray.at(TOUCH_CLOUD_DISTANCE_M, this.touchOrbPoint);
      return this.touchOrbPoint;
    }
    if (!this.isImmersive() && !this.flatTouchInput && !this.dragging) {
      // Until the cursor moves, keep charge notes on the side anchors — the
      // default aim (0,0) put a dense Start-energy ball mid-screen in front
      // of the head.
      if (!this.aimHasMoved) {
        return hand === 'right' ? FLAT_RIGHT_HAND : FLAT_LEFT_HAND;
      }
      // Desktop notes orbit the actual cursor and depart from it, while
      // touch keeps the fixed charge origin and XR keeps the live palms.
      this.desktopNdc.set(this.aimNdc.x, this.aimNdc.y);
      this.world.camera.updateMatrixWorld();
      this.desktopRay.setFromCamera(this.desktopNdc, this.world.camera);
      if (this.desktopRay.ray.intersectPlane(this.pointerNotePlane, this.pointerNoteAnchor)) {
        return this.pointerNoteAnchor;
      }
    }
    return hand === 'right' ? FLAT_RIGHT_HAND : FLAT_LEFT_HAND;
  }

  /** Beam ray for the active beam: live palm aim in XR, flat aim point
   * otherwise. */
  private beamRay(out: { origin: Vector3; direction: Vector3 }): void {
    const beamHand = this.game.getBeamHand() ?? this.game.getFiringHand();
    out.origin.copy(this.handAnchor(beamHand));
    if (this.debugBeamOrigin != null) {
      out.origin.copy(this.debugBeamOrigin);
    }
    if (!this.isImmersive() && this.flatTouchInput && this.dragging) {
      // The dragged orb leaves from its resting corner toward the finger.
      out.origin.copy(this.restingOrbPoint(this.touchOrbPoint));
      // Soft-lock when the finger is on a rift: corner-orb → camera-plane aim
      // can graze past BEAM_HIT_RADIUS even though the finger covers the rift.
      this.world.camera.updateMatrixWorld();
      let bestDist = TOUCH_RIFT_LOCK_NDC;
      let locked: Vector3 | null = null;
      for (const view of this.riftViews.values()) {
        this.touchRiftNdc.copy(view.position).project(this.world.camera);
        const d = Math.hypot(
          this.touchRiftNdc.x - this.aimNdc.x,
          this.touchRiftNdc.y - this.aimNdc.y,
        );
        if (d <= bestDist) {
          bestDist = d;
          locked = view.position;
        }
      }
      if (locked != null) {
        out.direction.copy(locked).sub(out.origin).normalize();
        return;
      }
    }
    if (this.xrBeamActive) {
      const palm = this.palms[beamHand];
      if (palm != null) {
        out.direction.set(
          palm.direction[0],
          palm.direction[1],
          palm.direction[2],
        );
        return;
      }
    }
    // Aim through the rendered camera onto the rift plane so the beam lands
    // where the finger or cursor actually is (a fixed-extent guess missed
    // rifts on portrait screens).
    this.touchBeamTarget.set(
      this.aimNdc.x * 2.2,
      1.6 + this.aimNdc.y * 1.2,
      -2.5,
    );
    this.desktopNdc.set(this.aimNdc.x, this.aimNdc.y);
    this.world.camera.updateMatrixWorld();
    this.desktopRay.setFromCamera(this.desktopNdc, this.world.camera);
    if (this.desktopRay.ray.intersectPlane(this.flatInputPlane, this.flatInputPoint)) {
      this.touchBeamTarget.copy(this.flatInputPoint);
    }
    out.direction.copy(this.touchBeamTarget.sub(out.origin)).normalize();
  }

  private readonly beamRayScratch = {
    origin: new Vector3(),
    direction: new Vector3(),
  };

  private firingHandSide(): HandSide | null {
    if (!this.game.isBeamActive()) return null;
    return this.game.getBeamHand() ?? this.game.getFiringHand();
  }

  /** Dedicated note torrent along the beam corridor while sealing a rift. */
  private updateSealTorrent(
    origin: Vector3,
    end: Vector3,
    sealing: boolean,
  ): void {
    if (this.torrentMeshes.length === 0) return;
    if (!sealing || !this.game.isBeamActive()) {
      for (const mesh of this.torrentMeshes) mesh.visible = false;
      return;
    }
    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const dz = end.z - origin.z;
    const fl = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / fl;
    const fy = dy / fl;
    const fz = dz / fl;
    const hx = Math.abs(fy) < 0.9 ? 0 : 1;
    const hy = hx === 0 ? 1 : 0;
    let ux = fy * 0 - fz * hy;
    let uy = fz * hx - fx * 0;
    let uz = fx * hy - fy * hx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = fy * uz - fz * uy;
    const vy = fz * ux - fx * uz;
    const vz = fx * uy - fy * ux;
    const camQ = this.world.camera.quaternion;
    for (let i = 0; i < this.torrentMeshes.length; i++) {
      const mesh = this.torrentMeshes[i];
      const seed = this.torrentSeeds;
      const speed = seed[i * 4 + 2];
      const u = (seed[i * 4] + this.beamTimeSec * speed * 1.15) % 1;
      const e = u * u * (3 - 2 * u);
      const swirl = seed[i * 4 + 1] + this.beamTimeSec * 5.5 + i * 0.4;
      const rad =
        seed[i * 4 + 3] *
        Math.sin(Math.PI * e) *
        (0.85 + 0.35 * Math.sin(swirl * 0.7));
      mesh.position.set(
        origin.x + dx * e + (ux * Math.cos(swirl) + vx * Math.sin(swirl)) * rad,
        origin.y + dy * e + (uy * Math.cos(swirl) + vy * Math.sin(swirl)) * rad,
        origin.z + dz * e + (uz * Math.cos(swirl) + vz * Math.sin(swirl)) * rad,
      );
      const fade = e < 0.08 ? e / 0.08 : e > 0.82 ? (1 - e) / 0.18 : 1;
      mesh.scale.setScalar(2.4 + 0.7 * (1 - e));
      mesh.quaternion.copy(camQ);
      const mat = mesh.material as MeshBasicMaterial;
      mat.opacity = fade;
      mat.depthTest = false;
      mesh.visible = fade > 0.04;
    }
  }

  /**
   * Encounter drive: while the Wall Tones rift encounter runs, this system
   * renders portals and sealing inside the main game instead of the Lab.
   * Spawns, charge and run resets come from the shared RiftEncounter
   * controller; sealing input/visuals are the Lab's existing paths. The Lab
   * panel, Start flow, starting-energy grant and auto-spawn stay Lab-only.
   */
  private syncEncounterDrive(): void {
    const want = this.lastMode === 'walltones' && riftEncounter.encounterActive();
    if (want === this.encounterLive) return;
    this.encounterLive = want;
    if (want) {
      this.active = true;
      this.root.visible = true;
      this.running = true;
      this.aimHasMoved = false;
      this.awaitingWalls = false;
      return;
    }
    // Drive lost (mode change or encounter resolved): drop encounter scene
    // state. The controller decides what the rules keep (onDriveLost).
    if (this.lastMode !== 'riftlab') {
      this.active = false;
      this.root.visible = false;
    }
    riftEncounter.onDriveLost();
    this.stopRun();
  }

  /** Encounter servicing each frame while the drive is live. */
  private serviceEncounterDrive(): void {
    if (riftEncounter.consumeClearRequested()) {
      for (const id of [...this.riftViews.keys()]) {
        this.removeRiftView(id);
      }
      this.game.resetRun();
    }
    while (riftEncounter.consumeDueSpawn()) {
      const before = this.riftViews.size;
      this.spawnRift(true);
      if (this.riftViews.size === before) {
        // No safe spot (MR walls unknown yet, flat crowding): retry soon,
        // never skip the portal.
        riftEncounter.failLastSpawn();
        break;
      }
    }
    let charge: PadColorName | null;
    while ((charge = riftEncounter.consumeCharge()) != null) {
      this.game.addNoteEnergy(charge);
    }
    riftEncounter.setOpenRifts(
      this.game
        .getRifts()
        .filter((rift) => rift.state === 'open' || rift.state === 'opening')
        .length,
    );
  }

  update(delta: number): void {
    this.syncEncounterDrive();
    if (!this.active) {
      riftTargetPositions.length = 0;
      riftAimRays.length = 0;
      return;
    }
    if (this.encounterLive) this.serviceEncounterDrive();
    this.updateXrHands();
    syncRiftAudioListener(this.world.camera);
    this.game.updateOrbit(delta);

    // XR: keep every charge note on a tracked palm. setStartingEnergy splits
    // notes across both hands, so an untracked left left a dense cloud on the
    // flat start-space anchor while the live right hand looked empty.
    if (this.isImmersive()) {
      const leftOk = this.palms.left != null;
      const rightOk = this.palms.right != null;
      const fallback: 'left' | 'right' | null = rightOk
        ? 'right'
        : leftOk
          ? 'left'
          : null;
      if (fallback != null) {
        for (const note of this.game.getNotes()) {
          if (this.palms[note.hand] == null) note.hand = fallback;
        }
      }
    }

    // Sync orbit note meshes with the logic model.
    const seen = new Set<number>();
    for (const note of this.game.getNotes()) {
      seen.add(note.id);
      let mesh = this.noteMeshes.get(note.id);
      if (mesh == null) {
        // Clone so per-note opacity can fade notes behind the palm without
        // changing every note that shares that pad color.
        mesh = new Mesh(
          new PlaneGeometry(NOTE_SIZE_M * 2.4, NOTE_SIZE_M * 2.4),
          noteGlyphMaterial(note.color).clone(),
        );
        // Draw under UI panels. Transparent sorting puts closer objects
        // last, so without this the flat charge cloud (parked nearer the
        // camera than the game HUD) painted over the panel while the rift
        // itself sat behind it (his Nov 19 playtest note).
        mesh.renderOrder = -1;
        this.noteMeshes.set(note.id, mesh);
        this.root.add(mesh);
      }
      // Immersive + no tracked palms: hide the cloud (no flat-world park).
      if (this.isImmersive() && this.palms[note.hand] == null) {
        mesh.visible = false;
        continue;
      }
      const anchor = this.handAnchor(note.hand);
      const glowScale = this.fingertipGlowScale(anchor);
      // Default: volumetric sphere shell around the palm (desktop, touch,
      // untracked hands), with a slow breathing wobble.
      const wobble = 1 + 0.12 * Math.sin(note.angle * 3 + note.id);
      const sinPhi = Math.sin(note.phi);
      let ox = anchor.x + Math.cos(note.angle) * sinPhi * note.radius * wobble * glowScale;
      let oy = anchor.y + Math.cos(note.phi) * note.radius * wobble * glowScale;
      let oz = anchor.z + Math.sin(note.angle) * sinPhi * note.radius * wobble * glowScale;
      const joints = this.palms[note.hand]?.joints;
      if (joints != null) {
        // Tracked hand: ride the actual hand shape. Each note sits on a bone
        // (wrist to every finger chain) and swirls around it, so the cloud
        // wraps the hand instead of making an orb. Hardware-only look.
        const seg = note.id % HAND_SEGMENTS.length;
        const t = 0.5 + 0.5 * Math.sin(note.angle * 0.6 + note.id * 1.7);
        if (pointOnHandShape(joints, seg, t, this.shapePoint, this.shapeDir)) {
          const d = this.shapeDir;
          // Any vector not parallel to the bone gives a stable swirl basis.
          const hx = Math.abs(d[1]) < 0.9 ? 0 : 1;
          const hy = hx === 0 ? 1 : 0;
          let ux = d[1] * 0 - d[2] * hy;
          let uy = d[2] * hx - d[0] * 0;
          let uz = d[0] * hy - d[1] * hx;
          const ul = Math.hypot(ux, uy, uz) || 1;
          ux /= ul;
          uy /= ul;
          uz /= ul;
          const vx = d[1] * uz - d[2] * uy;
          const vy = d[2] * ux - d[0] * uz;
          const vz = d[0] * uy - d[1] * ux;
          const swirl = note.angle * 2 + note.id;
          const rad = note.radius * 0.3 * wobble;
          ox = this.shapePoint[0] + (ux * Math.cos(swirl) + vx * Math.sin(swirl)) * rad;
          oy = this.shapePoint[1] + (uy * Math.cos(swirl) + vy * Math.sin(swirl)) * rad;
          oz = this.shapePoint[2] + (uz * Math.cos(swirl) + vz * Math.sin(swirl)) * rad;
        }
      }
      // Charge-orbit notes stay on the hands; sealing flow uses torrentMeshes.
      mesh.position.set(ox, oy, oz);
      mesh.scale.setScalar(1 + (glowScale - 1) * 0.3);
      // Notes face the viewer (billboard), in XR and flat alike.
      mesh.quaternion.copy(this.world.camera.quaternion);
      const mat = mesh.material as MeshBasicMaterial;
      mat.depthTest = true;
      // Soft fade when the note sits on the far side of the palm from the
      // camera; depth occluders also hide notes that pass through the hand.
      const front = noteFrontVisibility(
        mesh.position.x,
        mesh.position.y,
        mesh.position.z,
        this.palms[note.hand],
        this.world.camera,
        this.noteOccPalm,
        this.noteOccCam,
        this.noteOccNote,
      );
      mat.opacity = 0.2 + 0.8 * front;
      mesh.visible = front > 0.05 || this.palms[note.hand] == null;
    }
    for (const [id, mesh] of this.noteMeshes) {
      if (!seen.has(id)) {
        this.root.remove(mesh);
        this.noteMeshes.delete(id);
      }
    }

    this.handOccluders?.update(this.palms.left, this.palms.right);

    this.reflowFlatRifts();
    // Animate the fractures and publish target positions for the panel dodge.
    const nowMs = performance.now();
    riftAimRays.length = 0;
    for (const hand of ['right', 'left'] as const) {
      const palm = this.palms[hand];
      // Looser than the fire gate: lift the menu as soon as a hand is open
      // enough to be aimed, before the beam can actually start.
      if (palm != null && palm.extendedFingers >= 3) {
        riftAimRays.push({
          ox: palm.center[0], oy: palm.center[1], oz: palm.center[2],
          dx: palm.direction[0], dy: palm.direction[1], dz: palm.direction[2],
        });
      }
    }
    riftTargetPositions.length = 0;
    this.world.camera.getWorldQuaternion(this.cameraWorldQuat);
    for (const view of this.riftViews.values()) {
      riftTargetPositions.push({
        x: view.position.x,
        y: view.position.y,
        z: view.position.z,
      });
      const u = view.fracture.uniforms;
      const age = (nowMs - view.born) / 1000;
      u.uTime.value = age;
      u.uOpen.value = Math.min(1, age / 0.9);
      const flightMs = this.game.isBeamActive() ? SEAL_HOLD_MS : DESKTOP_NOTES_FLIGHT_MS;
      u.uSeal.value =
        view.rift.state === 'sealing' || view.rift.state === 'sealed'
          ? this.debugSealP ?? Math.min(1, view.rift.sealProgressMs / flightMs)
          : 0;
      const sealing = view.rift.state === 'sealing';
      updatePortalBurst(view.burst, {
        age,
        open: u.uOpen.value as number,
        seal: u.uSeal.value as number,
        sealing,
        cameraQuat: this.cameraWorldQuat,
      });
    }

    if (this.running) {
      if (this.awaitingWalls && performance.now() - this.lastSpawnAt > 500) {
        this.lastSpawnAt = performance.now();
        if (this.currentWalls().length > 0) {
          this.awaitingWalls = false;
          this.spawnRift();
          if (this.riftViews.size > 0) {
            this.renderPanel('A rift is open on your wall. Charge up and seal it.');
          }
        }
      }
      this.updateXrBeam();
      const now = performance.now();
      // Lab-only top-up timer. The gameplay encounter owns its schedule in
      // RiftEncounter (three portals total; a sealed portal never respawns
      // in this stage, his Nov 19 playtest note), so this timer must not
      // run alongside it.
      if (
        !this.encounterLive &&
        !this.autoSpawnPaused &&
        this.riftViews.size < MAX_OPEN_RIFTS &&
        now - this.lastSpawnAt >= RIFT_SPAWN_INTERVAL_MS
      ) {
        this.lastSpawnAt = now;
        this.spawnRift();
      }

      // Beam: live palm aim in XR (open palm), the flat aim point otherwise.
      this.beamTimeSec += delta;
      let hitStrength = 0;
      if (this.game.isBeamActive()) {
        const ray = this.beamRayScratch;
        this.beamRay(ray);
        startBeamHum(ray.origin);
        const nowHit = performance.now();
        if (
          this.geoSurfaces.length === 0 ||
          nowHit - this.lastGeoSurfaceRefreshAt >= GEO_SURFACE_REFRESH_MS
        ) {
          this.refreshGeometrySurfaces();
          this.lastGeoSurfaceRefreshAt = nowHit;
        }
        const dir = ray.direction;
        const origin = ray.origin;
        let endT = BEAM_MAX_M;
        let geoHit = false;
        if (
          closestSurfaceHit(
            origin.x, origin.y, origin.z,
            dir.x, dir.y, dir.z,
            this.beamSurfaces,
            0.05,
            BEAM_MAX_M,
            this.surfaceHit,
          )
        ) {
          endT = this.surfaceHit.t;
          geoHit = true;
          this.geoHitPoint.set(this.surfaceHit.x, this.surfaceHit.y, this.surfaceHit.z);
          this.geoScratchNormal.set(this.surfaceHit.nx, this.surfaceHit.ny, this.surfaceHit.nz);
        }
        // Flat touch: the resting orb sits centimeters above unnamed floor /
        // dome meshes. Those hits (≈0.1 m) used to kill the seal beam before
        // it reached the rift. Room furniture still stops XR beams via the
        // mesh path below; touch drag aims with beamSurfaces + rift radius.
        const meshT =
          !this.isImmersive() && this.flatTouchInput && this.dragging
            ? Number.POSITIVE_INFINITY
            : this.closestMeshHit(origin, dir);
        if (meshT < endT) {
          endT = meshT;
          geoHit = true;
          this.geoHitPoint.copy(this.beamMeshPoint);
          this.geoScratchNormal.copy(this.beamMeshNormal);
        }
        this.beamEnd.copy(origin).addScaledVector(dir, endT);
        for (const view of this.riftViews.values()) {
          this.beamHitPoint.copy(view.position).sub(origin);
          const along = this.beamHitPoint.dot(dir);
          if (along <= 0 || along > endT + 0.2) continue;
          this.beamHitPoint.copy(origin).addScaledVector(dir, along);
          if (this.beamHitPoint.distanceTo(view.position) <= BEAM_HIT_RADIUS_M) {
            this.beamEnd.copy(view.position);
            hitStrength =
              view.rift.state === 'sealing'
                ? 0.55 + 0.45 * Math.min(1, view.rift.sealProgressMs / SEAL_HOLD_MS)
                : 0.75;
            this.game.applyBeamOnRift(view.rift.id, delta * 1000);
            break;
          }
        }
        // Do not inflate hitStrength on ordinary wall/mesh stops — that drew a
        // large white impact sprite mid-room that looked like a solid sphere.
        this.sealBeam?.update({
          origin,
          end: this.beamEnd,
          hitStrength,
          timeSec: this.beamTimeSec,
          visible: true,
        });
        // Notes stream the whole time the beam is on, hand → current end.
        this.updateSealTorrent(origin, this.beamEnd, true);
        if (geoHit) this.emitBeamHitSparks(delta);
      } else {
        stopBeamHum();
        this.sealBeam?.update({
          origin: this.beamEnd,
          end: this.beamEnd,
          hitStrength: 0,
          timeSec: this.beamTimeSec,
          visible: false,
        });
        this.updateSealTorrent(this.beamEnd, this.beamEnd, false);
        this.beamHitSprayAcc = 0;
      }

      // Hand aura: four-color filaments / embers around charged palms.
      // Flat mode shares one charge origin; keep a single aura there so left
      // and right filaments do not stack on the cursor.
      const immersiveHands = this.isImmersive();
      this.handAura?.update({
        // Untracked XR hands must not fall back to the flat anchors, or a
        // white core sits in mid-air in front of the player.
        left: immersiveHands
          ? this.palms.left != null ? this.handAnchor('left') : null
          : null,
        right: immersiveHands
          ? this.palms.right != null ? this.handAnchor('right') : null
          : this.handAnchor('right'),
        firing: this.firingHandSide(),
        energy01: Math.min(1, this.game.getEnergy() / MAX_ENERGY),
        timeSec: this.beamTimeSec,
        usePalmLight: this.experimentPalmLight,
      });

      // Spent energy leaves the hands once no seal is in flight.
      if (![...this.riftViews.values()].some((v) => v.rift.state === 'sealing')) {
        this.game.pruneNotesToEnergy();
      }

      // Desktop notes-flight seals advance without the beam.
      for (const view of this.riftViews.values()) {
        if (this.debugSealP != null) break;
        this.game.updateDesktopSeal(view.rift.id, delta * 1000);
      }

      const cleared = this.game.clearSealed();
      if (cleared > 0 && this.encounterLive) riftEncounter.noteSealed(cleared);
      if (cleared > 0) {
        for (const [id, view] of this.riftViews) {
          if (view.rift.state === 'sealed') {
            // Final welding burst rains onto room geometry.
            this.riftOutwardNormal(view, this.geoScratchNormal);
            const col = this.geoColors[view.rift.edgeColors[0]];
            emitSpray(
              this.geoPool,
              view.position.x,
              view.position.y,
              view.position.z,
              this.geoScratchNormal.x,
              this.geoScratchNormal.y,
              this.geoScratchNormal.z,
              GEO_SEAL_BURST,
              col,
              1.1,
              2.4,
            );
            void playRiftSeal(view.position);
            this.removeRiftView(id);
          }
        }
        this.renderPanel('Rift sealed.');
      }
      this.updateGeometryParticles(delta);
    }

    if (performance.now() - this.lastUiUpdate >= 250) {
      this.renderPanel();
    }
  }

  private renderPanel(statusOverride?: string): void {
    this.lastUiUpdate = performance.now();
    if (statusOverride != null) {
      this.statusMessage = statusOverride;
      this.statusText?.setProperties({ text: statusOverride } as never);
    }
    const needsMr = this.isImmersive()
      ? !this.isMixedReality()
      : enterXrButtonVisible(true, this.world.xrEnabled, false, navigator.userAgent);
    (this.mrButton as { setProperties?: (p: object) => void } | null)
      ?.setProperties?.({ display: needsMr ? 'flex' : 'none' });
    this.energyText?.setProperties({
      text: `Energy: ${Math.round(this.game.getEnergy())}`,
    } as never);
    const open = this.game
      .getRifts()
      .filter((rift) => rift.state === 'open' || rift.state === 'sealing').length;
    const modifier = this.game.openRiftModifierActive()
      ? `Score/bars x${this.game.openRiftScoreMultiplier()} while a rift is open (initial tuning)`
      : 'Open-rift modifier: off';
    this.telemetryText?.setProperties({
      text: `Rifts open: ${open}. ${modifier}.`,
    } as never);
  }

  private debugSealFirstRift(): void {
    const first = [...this.riftViews.keys()][0];
    if (first == null) return;
    if (!this.game.isBeamActive()) {
      this.game.startBeam({ kind: 'mobile-drag', dx: 0, dy: 0 });
    }
    this.game.applyBeamOnRift(first, 100000);
    this.game.clearSealed();
    const position = this.riftViews.get(first)?.position;
    this.removeRiftView(first);
    void playRiftSeal(position);
    this.renderPanel('Rift sealed.');
  }

  /** Hold a mid-seal visual without completing the seal (screenshot QA). */
  private debugPreviewSeal(progress: number): void {
    if (this.riftViews.size === 0) this.spawnRift();
    // Prefer the rift closest to frame center so the beam is on-camera.
    let bestId: number | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    this.world.camera.updateMatrixWorld();
    for (const [id, view] of this.riftViews) {
      const ndc = view.position.clone().project(this.world.camera);
      const score = ndc.x * ndc.x + ndc.y * ndc.y;
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (bestId == null) return;
    const view = this.riftViews.get(bestId);
    if (view != null) {
      const ndc = view.position.clone().project(this.world.camera);
      this.aimNdc = { x: ndc.x, y: ndc.y };
    }
    if (!this.game.isBeamActive()) {
      this.game.startBeam({ kind: 'mobile-drag', dx: 0, dy: 0 });
    }
    // Keep the beam origin near the player so the layered shaft is visible in
    // flat screenshots (desktop note anchors sit on the cursor/rift).
    this.debugBeamOrigin = this.debugBeamOriginScratch;
    const clamped = Math.max(0.05, Math.min(0.95, progress));
    this.game.applyBeamOnRift(bestId, SEAL_HOLD_MS * clamped);
    this.debugSealP = clamped;
    this.renderPanel('Preview seal visuals.');
  }

  private riftOutwardNormal(view: RiftView, out: Vector3): Vector3 {
    view.group.updateWorldMatrix(true, false);
    return out.set(0, 0, 1).transformDirection(view.group.matrixWorld).normalize();
  }

  private clearGeometryParticles(): void {
    this.geoPool.life.fill(0);
    this.geoPool.col.fill(0);
    this.geoPool.alive = 0;
    this.beamHitSprayAcc = 0;
    if (this.geoSparkDraw != null) {
      this.geoSparkDraw.mesh.visible = false;
      this.geoSparkDraw.mesh.count = 1;
    }
  }

  /**
   * Item 93 collision surfaces. Real room planes come from the XRPlane
   * query and only in mixed reality (never synthesized on desktop). The
   * y=0 session-space ground and each rift's host wall plane are known in
   * every mode. Ground is particle-only: beam length uses `beamSurfaces`
   * (hosts + rooms) so a low mobile orb beam and Quest unbounded y≈0 do
   * not die into the synthetic floor before reaching a rift.
   */
  private refreshGeometrySurfaces(): void {
    this.geoSurfaces.length = 0;
    this.beamSurfaces.length = 0;
    this.player.head.getWorldPosition(this.headPos);
    // Always keep spark bounce ground in flat + MR.
    this.geoSurfaces.push(planeSurface('ground', 0, 1, 0, 0, 0, 0));
    for (const view of this.riftViews.values()) {
      this.riftOutwardNormal(view, this.geoScratchNormal);
      const host = planeSurface(
        'rift-host',
        this.geoScratchNormal.x,
        this.geoScratchNormal.y,
        this.geoScratchNormal.z,
        view.position.x,
        view.position.y,
        view.position.z,
      );
      this.geoSurfaces.push(host);
      this.beamSurfaces.push(host);
    }
    if (!this.isMixedReality()) return;
    let roomCount = 0;
    for (const entity of this.queries.planes.entities) {
      if (roomCount >= 16) break;
      const plane = entity.getValue(XRPlane, '_plane') as
        | { polygon?: DOMPointReadOnly[] }
        | undefined;
      const object3D = entity.object3D;
      if (plane == null || object3D == null) continue;
      object3D.updateWorldMatrix(true, false);
      // IWSDK plane meshes are thin boxes in local XZ; local +Y is the
      // plane normal (same convention as plane-placement.ts).
      const n = this.geoScratchNormal
        .set(0, 1, 0)
        .transformDirection(object3D.matrixWorld)
        .normalize();
      const u = this.geoScratchU
        .set(1, 0, 0)
        .transformDirection(object3D.matrixWorld)
        .normalize();
      const v = this.geoScratchV
        .set(0, 0, 1)
        .transformDirection(object3D.matrixWorld)
        .normalize();
      const o = object3D.getWorldPosition(this.geoScratchOrigin);
      let minU = Number.NEGATIVE_INFINITY;
      let maxU = Number.POSITIVE_INFINITY;
      let minV = Number.NEGATIVE_INFINITY;
      let maxV = Number.POSITIVE_INFINITY;
      const polygon = plane.polygon;
      if (polygon != null && polygon.length > 0) {
        minU = Number.POSITIVE_INFINITY;
        maxU = Number.NEGATIVE_INFINITY;
        minV = Number.POSITIVE_INFINITY;
        maxV = Number.NEGATIVE_INFINITY;
        for (const point of polygon) {
          minU = Math.min(minU, point.x);
          maxU = Math.max(maxU, point.x);
          minV = Math.min(minV, point.z);
          maxV = Math.max(maxV, point.z);
        }
      }
      const room: CollisionSurface = {
        nx: n.x,
        ny: n.y,
        nz: n.z,
        d: n.x * o.x + n.y * o.y + n.z * o.z,
        px: o.x,
        py: o.y,
        pz: o.z,
        ux: u.x,
        uy: u.y,
        uz: u.z,
        vx: v.x,
        vy: v.y,
        vz: v.z,
        minU,
        maxU,
        minV,
        maxV,
        kind: 'room',
      };
      this.geoSurfaces.push(room);
      this.beamSurfaces.push(room);
      roomCount++;
    }
  }

  /**
   * Welding sparks at the beam's resolved hit. The caller already picked the
   * closest surface or mesh and stored it in geoHitPoint / geoScratchNormal.
   */
  private emitBeamHitSparks(delta: number): void {
    const nx = this.geoScratchNormal.x;
    const ny = this.geoScratchNormal.y;
    const nz = this.geoScratchNormal.z;
    this.beamHitSprayAcc += delta * GEO_BEAM_HIT_RATE;
    const count = Math.floor(this.beamHitSprayAcc);
    if (count <= 0) return;
    this.beamHitSprayAcc -= count;
    const rgb =
      this.geoColors[
        PAD_COLOR_NAMES[Math.floor(this.beamTimeSec / 0.55) % 4]!
      ]!;
    emitSpray(
      this.geoPool,
      this.geoHitPoint.x + nx * 0.03,
      this.geoHitPoint.y + ny * 0.03,
      this.geoHitPoint.z + nz * 0.03,
      nx,
      ny,
      nz,
      Math.min(count, 24),
      rgb,
      0.6,
      1.8,
    );
  }

  private updateGeometryParticles(delta: number): void {
    const now = performance.now();
    if (
      now - this.lastGeoSurfaceRefreshAt >= GEO_SURFACE_REFRESH_MS &&
      (this.geoPool.alive > 0 || this.riftViews.size > 0 || this.game.isBeamActive())
    ) {
      this.lastGeoSurfaceRefreshAt = now;
      this.refreshGeometrySurfaces();
    }
    if (this.running) {
      for (const view of this.riftViews.values()) {
        if (view.rift.state !== 'sealing') continue;
        view.sprayAcc += delta * GEO_SPRAY_RATE;
        const count = Math.floor(view.sprayAcc);
        if (count <= 0) continue;
        view.sprayAcc -= count;
        this.riftOutwardNormal(view, this.geoScratchNormal);
        const rgb =
          this.geoColors[
            view.rift.edgeColors[Math.floor(Math.random() * 4)]!
          ]!;
        emitSpray(
          this.geoPool,
          view.position.x + this.geoScratchNormal.x * 0.05,
          view.position.y + this.geoScratchNormal.y * 0.05,
          view.position.z + this.geoScratchNormal.z * 0.05,
          this.geoScratchNormal.x,
          this.geoScratchNormal.y,
          this.geoScratchNormal.z,
          count,
          rgb,
        );
      }
    }
    stepGeometryParticles(this.geoPool, delta, this.geoSurfaces);
    if (this.geoSparkDraw != null) {
      this.world.camera.getWorldQuaternion(this.cameraWorldQuat);
      syncGeoSparkDraw(this.geoSparkDraw, this.geoPool, this.cameraWorldQuat);
    }
  }

  /** Nearest solid mesh in front of the beam: detected room meshes plus
   * visible studio furniture. XR plane *meshes* are skipped here — they are
   * thin invisible boxes that still stopped the beam mid-room; walls/floors
   * are handled by closestSurfaceHit / geoSurfaces instead. */
  private closestMeshHit(origin: Vector3, direction: Vector3): number {
    const targets = this.beamTargets;
    targets.length = 0;
    for (const entity of this.queries.meshes.entities) {
      const obj = entity.object3D;
      if (obj == null) continue;
      obj.updateWorldMatrix(true, false);
      targets.push(obj);
    }
    this.collectVisibleSceneMeshes(this.world.scene, targets);
    if (targets.length === 0) return Number.POSITIVE_INFINITY;
    this.beamCaster.near = 0.08;
    this.beamCaster.far = BEAM_MAX_M;
    this.beamCaster.set(origin, direction);
    const hits = this.beamCaster.intersectObjects(targets, false);
    for (const hit of hits) {
      if (hit.distance >= BEAM_MAX_M) break;
      if (hit.face != null) {
        this.beamMeshNormal
          .copy(hit.face.normal)
          .transformDirection(hit.object.matrixWorld)
          .normalize();
        // Floor-like meshes (studio dome floor, etc.) sit under the mobile
        // resting orb and previously killed the seal beam at ~0.1 m. Sparks
        // still bounce on the synthetic ground plane; beam length ignores
        // near-horizontal hits.
        if (Math.abs(this.beamMeshNormal.y) > 0.85) continue;
        const toward =
          (origin.x - hit.point.x) * this.beamMeshNormal.x +
          (origin.y - hit.point.y) * this.beamMeshNormal.y +
          (origin.z - hit.point.z) * this.beamMeshNormal.z;
        if (toward < 0) this.beamMeshNormal.multiplyScalar(-1);
      } else {
        this.beamMeshNormal.copy(direction).multiplyScalar(-1);
      }
      this.beamMeshPoint.copy(hit.point);
      return hit.distance;
    }
    return Number.POSITIVE_INFINITY;
  }

  private collectVisibleSceneMeshes(root: Object3D, out: Object3D[]): void {
    const stack = this.meshWalk;
    stack.length = 0;
    // Skip the Lab VFX root and the XR player rig (gaze debug reticle, hand
    // meshes, controller rays). Those sit mid-room in the view and must not
    // stop the seal beam.
    const labRoot = this.root;
    const player = this.player;
    for (const child of root.children) {
      if (child !== labRoot && child !== player) stack.push(child);
    }
    while (stack.length > 0) {
      const obj = stack.pop();
      if (obj == null || obj === labRoot || obj === player) continue;
      // Named helper meshes that may sit outside the player hierarchy.
      if (obj.name === 'gaze-reticle' || obj.name === 'RiftHandOccluder') continue;
      // Child Visibility can stay true while a Demo parent is hidden, so a
      // graphite gem still answered beam raycasts mid-room. Require the full
      // ancestor chain to be visible.
      if ((obj as Mesh).isMesh === true && this.isObjectWorldVisible(obj)) {
        out.push(obj);
      }
      for (const child of obj.children) {
        if (child !== labRoot && child !== player) stack.push(child);
      }
    }
  }

  private isObjectWorldVisible(obj: Object3D): boolean {
    let cur: Object3D | null = obj;
    while (cur != null) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  private debugSnapshot(): RiftLabDebugSnapshot {
    return {
      active: this.active,
      running: this.running,
      energy: this.game.getEnergy(),
      noteCount: this.game.getNotes().length,
      openRifts: this.game
        .getRifts()
        .filter((rift) => rift.state === 'open' || rift.state === 'sealing')
        .length,
      modifierActive: this.game.openRiftModifierActive(),
      beamActive: this.game.isBeamActive(),
      status: this.statusMessage,
      noteOriginNdc: this.handAnchor('right').clone().project(this.world.camera).toArray(),
      noteCloudRadiusPx: Math.min(
        CLOUD_MAX_RADIUS_M * 1.12 * this.fingertipGlowScale(this.handAnchor('right')) *
          this.pxPerMeterAt(this.handAnchor('right')),
        9999,
      ),
      cameraPos: this.world.camera.getWorldPosition(new Vector3()).toArray(),
      cameraDir: this.world.camera.getWorldDirection(new Vector3()).toArray(),
      palms: this.palms,
      geometryParticles: {
        alive: this.geoPool.alive,
        emitted: this.geoPool.emitted,
        collisions: this.geoPool.collisions,
        roomImpacts: this.geoPool.roomImpacts,
        groundImpacts: this.geoPool.groundImpacts,
        riftHostImpacts: this.geoPool.riftHostImpacts,
        roomPlaneSurfaces: this.geoSurfaces.filter((s) => s.kind === 'room').length,
        riftHostSurfaces: this.geoSurfaces.filter((s) => s.kind === 'rift-host')
          .length,
        groundSurface: this.geoSurfaces.some((s) => s.kind === 'ground'),
      },
      rifts: this.game.getRifts().map((r) => ({ id: r.id, state: r.state, sealProgressMs: r.sealProgressMs })),
      targets: [...this.riftViews.values()].map((v) => ({
        id: v.rift.id,
        position: v.position.toArray(),
        ndc: v.position.clone().project(this.world.camera).toArray(),
      })),
    };
  }
}
