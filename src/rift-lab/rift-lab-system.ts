/**
 * Rift-sealing Lab mini-game (backlog item 75): IWSDK side.
 *
 * Lab-only prototype reached from the shared Lab menu. Placeholder rifts
 * (four-color fracture, style picked 12:27) spawn in the room; successful
 * notes charge the hands with energy shown as note particles in the four pad
 * colors orbiting both hands, densest on the firing one (his 12:20). Sealing
 * aims a hand-energy beam at a rift: open palm in XR (his 12:15), drag from
 * the fixed charge spot on mobile (settled 12:25). Final animated rift art
 * (particles/shaders/glows) is a later dedicated PR.
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
  UIKit,
  UIKitMLAsset,
  VisibilityState,
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
  stopBeamHum,
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
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Plane,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  CircleGeometry,
  Float32BufferAttribute,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import {
  PAD_COLORS,
  PAD_COLOR_NAMES,
  RiftLabGame,
  type PadColorName,
  type Rift,
} from './rift-energy.js';
import {
  DESKTOP_NOTES_FLIGHT_MS,
  SEAL_ENERGY_REQUIRED,
  SEAL_HOLD_MS,
  isOverLabPanel,
} from './rift-energy.js';

/** Virtual hand anchors in flat mode (meters, hub scene space). */
const FLAT_RIGHT_HAND = new Vector3(0.45, 1.35, -1.9);
const FLAT_LEFT_HAND = new Vector3(-0.45, 1.35, -1.9);
/** Fixed mobile charge spot (his settled mobile input): bottom-center drag. */
const CHARGE_SPOT_Y_FRAC = 0.82;
const CHARGE_SPOT_X_TOL_FRAC = 0.25;
/** Placeholder rift ring placement in front of the panel area. */
const RIFT_POSITIONS = [
  new Vector3(1.1, 1.7, -2.4),
  new Vector3(-1.1, 1.6, -2.4),
  new Vector3(0, 2.7, -2.4), // above the panel, outside the click guard
];
const RIFT_PLANE_M = 1.8;
const RIFT_SPAWN_INTERVAL_MS = 6000;
const MAX_OPEN_RIFTS = 3;
/** Beam hit test: ray-to-rift distance under this counts as contact. */
const BEAM_HIT_RADIUS_M = 0.3;

const NOTE_SIZE_M = 0.034;
/** Real-wall rift placement: reachable band around eye height. */
const WALL_RIFT_BAND_BELOW_M = 0.55;
const WALL_RIFT_BAND_ABOVE_M = 0.5;
const WALL_RIFT_INSET_M = 0.3;
const WALL_RIFT_SPACING_M = 1.2;
const WALL_RIFT_OFFSET_M = 0.03;

const noteGlyphTextureCache = new Map<string, Texture>();
/**
 * Colored note-glyph sprite. Additive-blend dots washed to white on the
 * bright room (14:38 live check, and his 13:41 correction: the dots must be
 * colorful musical notes); a per-color glyph texture with normal blending
 * stays readable.
 */
function noteGlyphTexture(color: PadColorName): Texture {
  let tex = noteGlyphTextureCache.get(color);
  if (tex == null) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      ctx.font = 'bold 52px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = PAD_COLORS[color];
      ctx.shadowBlur = 8;
      ctx.fillStyle = PAD_COLORS[color];
      ctx.strokeStyle = PAD_COLORS[color];
      ctx.lineWidth = 3;
      ctx.strokeText('\u266A', 32, 36);
      ctx.fillText('\u266A', 32, 36);
    }
    tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    noteGlyphTextureCache.set(color, tex);
  }
  return tex;
}

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
  targets: { id: number; position: number[]; ndc: number[] }[];
  noteOriginNdc: number[];
  /** Viewer pose, for QA placement of synthetic hands. */
  cameraPos: number[];
  cameraDir: number[];
}

declare global {
  interface Window {
    __riftLabDebug?: {
      snapshot: () => RiftLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      playNote: (color: PadColorName, hand?: 'left' | 'right') => void;
      spawnRift: () => void;
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
    };
  }
}

interface RiftView {
  rift: Rift;
  group: Group;
  position: Vector3;
  born: number;
  fracture: ShaderMaterial;
  sparks: Points;
  sparkSeeds: Float32Array;
  trail: { sprite: Sprite; spine: number; offset: number; speed: number; wig: number }[];
  debris: { mesh: Mesh; ang: number; spin: number; speed: number }[];
}

const SPARK_COUNT = 56;

/**
 * Living four-color fracture (style D, his concept art): a dark void with a
 * jagged, animated edge whose quadrants take the four pad colors, a soft
 * glow halo, and a distortion shimmer. uOpen widens it as it tears open;
 * uSeal closes and brightens it through the sealing stages. Normal blending
 * (additive washed out on bright rooms, 14:38 check).
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
  float r = length(p);
  float a = atan(p.y, p.x);
  float open = smoothstep(0.0, 1.0, uOpen);
  float keep = 1.0 - 0.92 * uSeal;
  // Torn hole: big, taller than wide, with a ragged outline.
  float jag = 0.64 + 0.26 * noise1(a * 3.0 + 7.0)
                   + 0.10 * noise1(a * 9.0 + uTime * 1.2)
                   + 0.06 * noise1(a * 23.0 - uTime * 2.4);
  vec2 hp = vec2(p.x * 1.18, p.y * 0.86);
  float hr = length(hp);
  float edge = 0.52 * jag * open * keep;
  float d = hr - edge;
  vec3 rim = quadColor(a);
  rim = mix(rim, vec3(1.0), 0.6 * uSeal);

  // Radial cracks in the wall: thin jagged lines fanning out of the hole,
  // fading with distance, glowing in the quadrant color.
  float crack = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float n = 7.0 + fi * 5.0;
    float warp = (noise1(hr * (9.0 + fi * 4.0) + fi * 11.0) - 0.5) * (0.55 - fi * 0.12);
    float cell = fract((a + warp) / 6.28318 * n + hash(fi) );
    float dist = abs(cell - 0.5) * 6.28318 / n * hr;
    float width = 0.006 + 0.004 * (1.0 - fi * 0.3);
    float reach = (0.95 - fi * 0.15) * open;
    float fade = step(edge, hr) * (1.0 - smoothstep(reach * 0.55, reach, hr)) * smoothstep(0.0, 0.05, hr - edge);
    float gate = step(0.5 + fi * 0.12, hash(floor((a + warp) / 6.28318 * n + hash(fi)) + fi * 5.0));
    crack += (exp(-dist / width) * 0.9 + exp(-dist / (width * 5.0)) * 0.25) * fade * gate;
  }
  crack *= keep;
  float flicker = 0.78 + 0.22 * noise1(a * 5.0 + uTime * 6.0);
  float line = exp(-abs(d) * 75.0) * flicker;
  float halo = exp(-max(d, 0.0) * 9.0) * 0.5 * keep;
  float inside = 1.0 - smoothstep(-0.015, 0.015, d);

  // Void: night sky with a drifting city/tower skyline inside the hole.
  vec2 vp = hp / max(edge, 0.001);
  float sky = clamp(0.5 + vp.y * 0.5, 0.0, 1.0);
  vec3 voidCol = mix(vec3(0.02, 0.02, 0.06), vec3(0.10, 0.07, 0.22), sky);
  float col_i = floor((vp.x + uTime * 0.02) * 9.0);
  float towerH = -0.25 + 0.55 * hash(col_i) * hash(col_i * 1.7 + 3.0);
  if (vp.y < towerH && vp.y > -1.0) voidCol = vec3(0.015, 0.015, 0.04);
  float star = step(0.992, hash(floor(vp.x * 40.0) + floor(vp.y * 40.0) * 57.0 + floor(uTime * 1.5)));
  voidCol += star * rim * 0.9;

  // Wall damage around the hole darkens the plaster.
  float scorch = exp(-max(d, 0.0) * 9.0) * 0.38 * keep * open;
  vec3 col = voidCol * inside + rim * (line * 1.3 + crack * 1.2) + rim * halo * 0.6;
  col = mix(col, vec3(0.02, 0.02, 0.03), (1.0 - inside) * scorch);
  col *= 1.0;
  float alpha = clamp(inside * 0.96 + line + halo * 0.8 + crack + scorch, 0.0, 1.0);
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
}) {
  private readonly game = new RiftLabGame();
  private panel: UIKitMLAsset | null = null;
  private statusText: UIKit.Text | null = null;
  private energyText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private active = false;
  private running = false;
  private lastSpawnAt = 0;
  private readonly root = new Group();
  private readonly noteMeshes = new Map<number, Mesh>();
  private readonly riftViews = new Map<number, RiftView>();
  private dragging = false;
  private flatTouchInput = false;
  private readonly pointerNotePlane = new Plane(new Vector3(0, 0, 1), 1.4);
  private readonly pointerNoteAnchor = new Vector3();
  private dragStart = { x: 0, y: 0 };
  private aimNdc = { x: 0, y: 0 };
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
  private beamLine: Line | null = null;
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
    this.world.scene.add(this.root);
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
      const bounds = canvas.getBoundingClientRect();
      this.aimNdc = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      };
      const fracX = event.clientX / window.innerWidth;
      const fracY = event.clientY / window.innerHeight;
      const nearChargeSpot =
        fracY >= CHARGE_SPOT_Y_FRAC - 0.08 &&
        Math.abs(fracX - 0.5) <= CHARGE_SPOT_X_TOL_FRAC;
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
          if (!fired) void playSealDenied();
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
    };
    const onPointerUp = () => {
      if (this.dragging) {
        this.dragging = false;
        this.game.stopBeam();
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail.mode;
      this.setActive(mode === 'riftlab');
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.setActive(
      (window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu') ===
        'riftlab',
    );

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      this.world.scene.remove(this.root);
      delete window.__riftLabDebug;
    });

    window.__riftLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.setActive(true),
      start: () => this.startRun(),
      playNote: (color, hand) => this.playNote(color, hand),
      spawnRift: () => this.spawnRift(),
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
    };
    this.renderPanel('Press Start. Successful notes charge your hands.');
  }

  private setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.visible = active;
    if (!active) {
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

  private startRun(): void {
    if (this.isImmersive() && !this.isMixedReality()) {
      // A passthrough-free VR session cannot show rifts on real walls.
      this.renderPanel(
        'Rift Lab needs mixed reality, not VR. Press Enter mixed reality below.',
      );
      return;
    }
    this.running = true;
    this.lastSpawnAt = performance.now();
    if (this.isMixedReality()) {
      this.roomCaptureAttempted = false;
      this.awaitingWalls = true;
      this.renderPanel('Looking for your real walls...');
      this.trySpawnOnWalls();
      return;
    }
    this.spawnRift();
    this.renderPanel('A rift is open. Charge up and seal it.');
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
  private pickWallSpot(): { position: Vector3; normal: Vector3 } | null {
    const walls = this.currentWalls();
    if (walls.length === 0) return null;
    const existing = [...this.riftViews.values()].map((v) => v.position);
    const crowd = (w: (typeof walls)[number]) =>
      existing.filter((p) => p.distanceTo(new Vector3(w.center.x, p.y, w.center.z)) < 1.5).length;
    const ordered = [...walls].sort((a, b) => crowd(a) - crowd(b));
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
    this.dragging = false;
    this.xrBeamActive = false;
    if (this.beamLine != null) {
      this.beamLine.visible = false;
    }
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
    void playNoteChime(picked);
    this.renderPanel(this.game.canFireBeam()
      ? 'Ready. Click a rift, or aim an open palm in XR.'
      : `Charge: ${Math.round(this.game.getEnergy())}/${SEAL_ENERGY_REQUIRED}.`);
  }

  private spawnRift(): void {
    if (this.riftViews.size >= MAX_OPEN_RIFTS) return;
    let wallSpot: { position: Vector3; normal: Vector3 } | null = null;
    if (this.isImmersive()) {
      // MR: only on real detected walls. No wall spot means no rift: pretend
      // walls would misstate what this Lab is testing.
      wallSpot = this.isMixedReality() ? this.pickWallSpot() : null;
      if (wallSpot == null) return;
    }
    const rift = this.game.spawnRift();
    const position =
      wallSpot != null
        ? wallSpot.position
        : RIFT_POSITIONS[(rift.id - 1) % RIFT_POSITIONS.length].clone();
    const lookTarget: Vector3 | null =
      wallSpot != null ? wallSpot.position.clone().add(wallSpot.normal) : null;
    void playRiftOpen();
    const group = new Group();
    // Living four-color fracture: shader void/edge plus drifting note sparks.
    const fracture = buildFracture(rift);
    const quad = new Mesh(new PlaneGeometry(RIFT_PLANE_M, RIFT_PLANE_M), fracture);
    group.add(quad);
    const sparkSeeds = new Float32Array(SPARK_COUNT * 3);
    const sparkColors: number[] = [];
    for (let i = 0; i < SPARK_COUNT; i++) {
      sparkSeeds[i * 3] = Math.random();
      sparkSeeds[i * 3 + 1] = Math.random() * Math.PI * 2;
      sparkSeeds[i * 3 + 2] = 0.5 + Math.random();
      const col = new Color(PAD_COLORS[rift.edgeColors[i % 4]]);
      sparkColors.push(col.r, col.g, col.b);
    }
    const sparkGeo = new BufferGeometry();
    sparkGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
    sparkGeo.setAttribute('color', new Float32BufferAttribute(sparkColors, 3));
    const sparks = new Points(
      sparkGeo,
      new PointsMaterial({
        size: 0.016,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sparks.frustumCulled = false;
    sparks.position.z = 0.01;
    group.add(sparks);
    // Note trails along four crack spines (his concept: glowing colored
    // notes streaming along the cracks), plus drifting rock debris.
    const trail: RiftView['trail'] = [];
    for (let spine = 0; spine < 4; spine++) {
      for (let k = 0; k < 7; k++) {
        const sprite = new Sprite(
          new SpriteMaterial({
            map: noteGlyphTexture(rift.edgeColors[spine]),
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        sprite.scale.setScalar(0.085);
        sprite.position.z = 0.02;
        group.add(sprite);
        trail.push({
          sprite,
          spine,
          offset: k / 7 + spine * 0.07,
          speed: 0.16 + ((rift.id * 13 + spine * 7 + k * 5) % 10) / 80,
          wig: ((rift.id + k * 3 + spine) % 7) / 7,
        });
      }
    }
    const debris: RiftView['debris'] = [];
    for (let i = 0; i < 7; i++) {
      const mesh = new Mesh(
        new CircleGeometry(0.012 + ((i * 7 + rift.id) % 5) * 0.006, 5),
        new MeshBasicMaterial({ color: 0x4a4650, transparent: true, depthWrite: false }),
      );
      mesh.position.z = 0.015;
      group.add(mesh);
      debris.push({
        mesh,
        ang: (i / 9) * Math.PI * 2 + rift.id,
        spin: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 3) * 0.3),
        speed: 0.02 + (i % 4) * 0.01,
      });
    }
    group.position.copy(position);
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
      sparks,
      sparkSeeds,
      trail,
      debris,
    });
    this.renderPanel();
  }

  private removeRiftView(id: number): void {
    const view = this.riftViews.get(id);
    if (view == null) return;
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
   * energy starts the beam; closing the hand or losing tracking stops it. */
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
      const palm = this.palms[this.game.getFiringHand()];
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
    for (const hand of ['right', 'left'] as const) {
      const palm = this.palms[hand];
      if (palm != null && palm.open && this.game.canFireBeam()) {
        this.xrBeamActive = this.game.startBeam({
          kind: 'xr-open-palm',
          hand,
        });
        if (this.xrBeamActive) {
          this.renderPanel('Palm beam firing. Aim at a rift.');
          break;
        }
      }
    }
  }

  private handAnchor(hand: 'left' | 'right'): Vector3 {
    const palm = this.palms[hand];
    if (palm != null) {
      const scratch =
        hand === 'right' ? this.palmAnchorRight : this.palmAnchorLeft;
      return scratch.set(palm.center[0], palm.center[1], palm.center[2]);
    }
    if (!this.isImmersive() && !this.flatTouchInput && !this.dragging) {
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
    out.origin.copy(this.handAnchor(this.game.getFiringHand()));
    if (this.xrBeamActive) {
      const palm = this.palms[this.game.getFiringHand()];
      if (palm != null) {
        out.direction.set(
          palm.direction[0],
          palm.direction[1],
          palm.direction[2],
        );
        return;
      }
    }
    const target = new Vector3(
      this.aimNdc.x * 2.2,
      1.6 + this.aimNdc.y * 1.2,
      -2.5,
    );
    out.direction.copy(target.sub(out.origin)).normalize();
  }

  private ensureBeamLine(): Line {
    if (this.beamLine == null) {
      this.beamLine = new Line(
        new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
        new LineBasicMaterial({
          color: new Color('#ffe9a8'),
          blending: AdditiveBlending,
          transparent: true,
          opacity: 0.9,
        }),
      );
      this.beamLine.visible = false;
      this.root.add(this.beamLine);
    }
    return this.beamLine;
  }

  private readonly beamRayScratch = {
    origin: new Vector3(),
    direction: new Vector3(),
  };

  update(delta: number): void {
    if (!this.active) {
      riftTargetPositions.length = 0;
      riftAimRays.length = 0;
      return;
    }
    this.updateXrHands();
    this.game.updateOrbit(delta);

    // Sync orbit note meshes with the logic model.
    const seen = new Set<number>();
    for (const note of this.game.getNotes()) {
      seen.add(note.id);
      let mesh = this.noteMeshes.get(note.id);
      if (mesh == null) {
        mesh = new Mesh(
          new PlaneGeometry(NOTE_SIZE_M * 2.4, NOTE_SIZE_M * 2.4),
          new MeshBasicMaterial({
            map: noteGlyphTexture(note.color),
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        this.noteMeshes.set(note.id, mesh);
        this.root.add(mesh);
      }
      const anchor = this.handAnchor(note.hand);
      // Default: volumetric sphere shell around the palm (desktop, touch,
      // untracked hands), with a slow breathing wobble.
      const wobble = 1 + 0.12 * Math.sin(note.angle * 3 + note.id);
      const sinPhi = Math.sin(note.phi);
      let ox = anchor.x + Math.cos(note.angle) * sinPhi * note.radius * wobble;
      let oy = anchor.y + Math.cos(note.phi) * note.radius * wobble;
      let oz = anchor.z + Math.sin(note.angle) * sinPhi * note.radius * wobble;
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
      const sealingView = [...this.riftViews.values()].find(
        (view) => view.rift.state === 'sealing',
      );
      let noteScale = 1;
      if (sealingView != null) {
        // Notes stream from the hand/pointer into the rift (the earlier
        // motion mockup): staggered launches, a curved swirling arc, shrinking
        // as they are absorbed, so it reads as a flow and not one lump.
        const flightMs = this.game.isBeamActive()
          ? SEAL_HOLD_MS
          : DESKTOP_NOTES_FLIGHT_MS;
        const p =
          this.debugSealP ?? Math.min(1, sealingView.rift.sealProgressMs / flightMs);
        const delay = ((note.id * 0.6180339) % 1) * 0.45;
        const u = Math.min(1, Math.max(0, (p - delay) / 0.55));
        const e = u * u * (3 - 2 * u);
        const dx = sealingView.position.x - ox;
        const dy = sealingView.position.y - oy;
        const dz = sealingView.position.z - oz;
        const arc = Math.sin(Math.PI * e) * 0.16 * (0.5 + ((note.id * 0.37) % 1));
        const ph = note.id * 2.1 + e * 9;
        mesh.position.set(
          ox + dx * e + Math.cos(ph) * arc,
          oy + dy * e + Math.sin(ph) * arc + arc * 0.6,
          oz + dz * e,
        );
        noteScale = 1 - 0.75 * Math.max(0, (e - 0.7) / 0.3);
      } else {
        mesh.position.set(ox, oy, oz);
      }
      mesh.scale.setScalar(noteScale);
      // Notes face the viewer (billboard), in XR and flat alike.
      mesh.quaternion.copy(this.world.camera.quaternion);
    }
    for (const [id, mesh] of this.noteMeshes) {
      if (!seen.has(id)) {
        this.root.remove(mesh);
        this.noteMeshes.delete(id);
      }
    }

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
      const pos = view.sparks.geometry.getAttribute('position');
      const sealing = view.rift.state === 'sealing';
      for (let i = 0; i < SPARK_COUNT; i++) {
        const sd = view.sparkSeeds;
        const life = (age * 0.35 * sd[i * 3 + 2] + sd[i * 3]) % 1;
        const ang = sd[i * 3 + 1] + age * 0.4;
        // Sparks drift out of the crack; while sealing they are pulled in.
        const rr = sealing
          ? (1 - life) * 0.2
          : (0.04 + life * 0.26) * (0.4 + 0.6 * u.uOpen.value);
        pos.setXYZ(i, Math.cos(ang) * rr * 0.65, Math.sin(ang) * rr * 1.1, 0);
      }
      pos.needsUpdate = true;
      const sealU = u.uSeal.value as number;
      const spineAng = [Math.PI * 0.72, Math.PI * 0.28, -Math.PI * 0.28, -Math.PI * 0.72];
      for (const t of view.trail) {
        let f = (age * t.speed * (sealing ? 3 : 1) + t.offset) % 1;
        if (sealing) f = 1 - f;
        const rr = (0.3 + f * 0.58) * (0.35 + 0.65 * u.uOpen.value);
        const base = spineAng[t.spine] + Math.sin(rr * 9 + t.wig * 6 + age * 1.3) * 0.12;
        t.sprite.position.set(Math.cos(base) * rr * 0.95, Math.sin(base) * rr * 1.1, 0.02);
        const m = t.sprite.material as SpriteMaterial;
        m.opacity = Math.min(1, f * 6, (1 - f) * 4) * (1 - 0.7 * sealU);
        t.sprite.scale.setScalar(0.085 * (0.7 + 0.5 * Math.sin(age * 4 + t.wig * 9)));
      }
      for (const dbr of view.debris) {
        const dd = 0.3 + ((age * dbr.speed + dbr.ang) % 0.6) * 0.5;
        dbr.mesh.position.set(Math.cos(dbr.ang) * dd * 0.9, Math.sin(dbr.ang) * dd * 1.05, 0.015);
        dbr.mesh.rotation.z = age * dbr.spin;
        (dbr.mesh.material as MeshBasicMaterial).opacity = 1 - sealU;
      }
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
      if (
        this.riftViews.size < MAX_OPEN_RIFTS &&
        now - this.lastSpawnAt >= RIFT_SPAWN_INTERVAL_MS
      ) {
        this.lastSpawnAt = now;
        this.spawnRift();
      }

      // Beam: live palm aim in XR (open palm), the flat aim point otherwise.
      if (this.game.isBeamActive()) {
        const ray = this.beamRayScratch;
        this.beamRay(ray);
        const line = this.ensureBeamLine();
        line.visible = true;
        startBeamHum();
        const end = ray.origin
          .clone()
          .add(ray.direction.clone().multiplyScalar(3.5));
        line.geometry.setFromPoints([ray.origin, end]);
        for (const view of this.riftViews.values()) {
          const toRift = view.position.clone().sub(ray.origin);
          const along = toRift.dot(ray.direction);
          if (along <= 0) continue;
          const closest = ray.origin
            .clone()
            .add(ray.direction.clone().multiplyScalar(along));
          if (closest.distanceTo(view.position) <= BEAM_HIT_RADIUS_M) {
            this.game.applyBeamOnRift(view.rift.id, delta * 1000);
            break;
          }
        }
      } else {
        stopBeamHum();
        if (this.beamLine != null) this.beamLine.visible = false;
      }

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
      if (cleared > 0) {
        for (const [id, view] of this.riftViews) {
          if (view.rift.state === 'sealed') {
            this.removeRiftView(id);
          }
        }
        this.renderPanel('Rift sealed.');
        void playRiftSeal();
      }
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
    this.removeRiftView(first);
    void playRiftSeal();
    this.renderPanel('Rift sealed.');
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
      cameraPos: this.world.camera.getWorldPosition(new Vector3()).toArray(),
      cameraDir: this.world.camera.getWorldDirection(new Vector3()).toArray(),
      palms: this.palms,
      targets: [...this.riftViews.values()].map((v) => ({
        id: v.rift.id,
        position: v.position.toArray(),
        ndc: v.position.clone().project(this.world.camera).toArray(),
      })),
    };
  }
}
