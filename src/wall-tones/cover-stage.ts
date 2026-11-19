/**
 * Cover landing stage (user ask, Nov 18): replaces the default IWSDK starter
 * dressing as the first screen. A floating 2x2 grid of glowing pads (app-icon
 * order: green, red / blue, yellow) hovers above the main menu, musical notes
 * circle it on tilted 3D orbits, and an animated spectrum strip runs along the
 * floor. Hub world only; visible in menu mode, hidden while playing or in
 * the Lab. Positions are grounded to the authored menu panel at
 * [0, 1.78, -2.75] and the flat camera at [0, 1.6, 1].
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  Vector3,
  VisibilityState,
  createSystem,
} from '@iwsdk/core';
import { SIMON_FANFARE_PAD_ORDER, WALL_TONE_PADS } from './constants.js';
import { isMainMenuDialogOpen } from '../main-menu-layout.js';
import {
  NOTE_ORBITS,
  SPECTRUM_BAR_COUNT,
  fanfareFlash,
  noteOrbitPosition,
  spectrumBarHeight,
} from './cover-stage-math.js';

/** Pad faces are textured rounded squares (glow rim, gloss, halo) drawn on
 * camera-facing planes; the whole cover art lives in one group whose local
 * units are the "grid" layout and which is scaled up on wide screens. */
const PAD_SIZE_M = 0.2;
const PAD_OFFSET_M = 0.12;
const PAD_EXTENT_M = PAD_OFFSET_M + PAD_SIZE_M / 2;
const PADS_CENTER = { x: 0, y: 2.1, z: -2.3 };
/** Tall screens: the Lab button floats at the top of the frame, so the title
 * sits above it, larger, and the pads get a bit of extra size. */
const GRID_GROUP_SCALE = 1.3;
const GRID_TITLE_LIFT_M = 0.02;
const GRID_TITLE_SCALE = 1.2;
const FOCAL_CENTER = { x: 0, y: 1.62, z: -1.9 };
const FOCAL_GROUP_SCALE = 2.2;
const FOCAL_ORBIT_SCALE = 1.7;
const FOCAL_NOTE_SCALE = 2.6;
const HALO_SCALE = 2.5;
const TITLE_WIDTH_M = 0.9;
const TITLE_ASPECT = 1024 / 230;
const REFLECTION_LENGTH_M = 0.2;
const SPECTRUM_GRID_Z_M = -2.3;
const SPECTRUM_SPLIT_Z_M = -0.55;
const SPECTRUM_SPLIT_HEIGHT_SCALE = 0.75;
/** MR: pads float above the menu panel, which follows the player. The
 * waveform is off in MR by default (recommendation: floor-tied, and adds
 * clutter around hand tracking); flip to bring it back below the panel. */
const MR_SHOW_SPECTRUM = false;
const MR_GROUP_SCALE = 1.1;
/** Half the main-menu panel height per unit of its scale, buttons stacked. */
const MR_PANEL_HALF_HEIGHT_UNITS = 2.3;
const MR_GAP_M = 0.12;
/** Flat screens: waveform sits on the bottom edge of the frame. */
const SPECTRUM_BOTTOM_NDC = -0.985;
const SPECTRUM_FLAT_HEIGHT_SCALE = 0.6;
const PREVIEW_MR =
  typeof window !== 'undefined' &&
  window.location.search.includes('coverLayout=mr');
const ZERO_SCALE_EPS = 1e-4;

/** What the pads face: the flat-mode camera, also the VR spawn area. */
const PADS_LOOK_AT = { x: 0, y: 1.6, z: 1 };
const NOTE_SIZE_M = 0.11;
const SPECTRUM_WIDTH_M = 3.4;
const SPECTRUM_BAR_WIDTH_M = 0.05;
const SPECTRUM_SEGMENTS = 12;
const SPECTRUM_SEG_PITCH_M = 0.045;
const SPECTRUM_SEG_HEIGHT_M = 0.031;
/** Four distinct blocks left to right, as in the approved mockup. */
const SPECTRUM_PAD_ORDER = [0, 2, 3, 1] as const;

/** Eighth-note silhouette (head + stem + flag), normalized to ~1 unit tall. */
function makeNoteGeometry(thickness: number): ExtrudeGeometry {
  const head = new Shape();
  head.absellipse(0, 0, 0.32, 0.24, 0, Math.PI * 2, false, 0);
  const stem = new Shape();
  stem.moveTo(0.24, 0);
  stem.lineTo(0.32, 0);
  stem.lineTo(0.32, 0.95);
  stem.lineTo(0.24, 0.95);
  stem.closePath();
  const flag = new Shape();
  flag.moveTo(0.32, 0.95);
  flag.quadraticCurveTo(0.72, 0.78, 0.62, 0.42);
  flag.quadraticCurveTo(0.52, 0.62, 0.32, 0.72);
  flag.closePath();
  const geo = new ExtrudeGeometry([head, stem, flag], {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.18,
    bevelSize: thickness * 0.12,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geo.center();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = bb == null ? 1 : Math.max(bb.max.y - bb.min.y, 1e-4);
  geo.scale(1 / h, 1 / h, 1 / h);
  geo.computeVertexNormals();
  return geo;
}


function padColorHex(id: number): number {
  return WALL_TONE_PADS[id].color;
}

function mixWhite(hex: number, amount: number): string {
  const color = new Color(hex).lerp(new Color(0xffffff), amount);
  return `#${color.getHexString()}`;
}

function makeCanvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

function toTexture(ctx: CanvasRenderingContext2D | null): CanvasTexture {
  const texture = new CanvasTexture(
    ctx?.canvas ?? (undefined as unknown as HTMLCanvasElement),
  );
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Glowing rounded-square pad face: bright rim, inner gradient, top gloss. */
function makePadFaceTexture(hex: number, reflection: boolean): CanvasTexture {
  const size = 256;
  const ctx = makeCanvas(size, size);
  if (ctx != null) {
    const base = `#${new Color(hex).getHexString()}`;
    const inset = 22;
    const body = size - inset * 2;
    roundedRectPath(ctx, inset, inset, body, body, 54);
    const fill = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.55);
    fill.addColorStop(0, mixWhite(hex, 0.32));
    fill.addColorStop(0.55, base);
    fill.addColorStop(1, `#${new Color(hex).multiplyScalar(0.55).getHexString()}`);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, inset, 0, size / 2);
    gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(inset, inset, body, body / 2);
    ctx.restore();
    roundedRectPath(ctx, inset, inset, body, body, 54);
    ctx.lineWidth = 9;
    ctx.strokeStyle = mixWhite(hex, 0.62);
    ctx.shadowColor = base;
    ctx.shadowBlur = 20;
    ctx.stroke();
    if (reflection) {
      // Fade the mirrored copy away from the pad edge (canvas bottom).
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'destination-in';
      const mask = ctx.createLinearGradient(0, 0, 0, size);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(0.45, 'rgba(0,0,0,0.05)');
      mask.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, size, size);
    }
  }
  return toTexture(ctx);
}

/** Soft colored bloom behind a pad (shadow-only draw, no ctx.filter). */
function makeHaloTexture(hex: number): CanvasTexture {
  const size = 256;
  const ctx = makeCanvas(size, size);
  if (ctx != null) {
    ctx.shadowColor = `#${new Color(hex).getHexString()}`;
    ctx.shadowBlur = 46;
    ctx.shadowOffsetX = 1000;
    ctx.fillStyle = '#ffffff';
    roundedRectPath(ctx, 74 - 1000, 74, 108, 108, 30);
    ctx.fill();
  }
  return toTexture(ctx);
}

/** Wide horizontal glow, used as the glossy-floor horizon line and pools. */
function makeStreakTexture(): CanvasTexture {
  const ctx = makeCanvas(256, 32);
  if (ctx != null) {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 32);
    ctx.globalCompositeOperation = 'destination-in';
    const v = ctx.createLinearGradient(0, 0, 0, 32);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.5, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 256, 32);
  }
  return toTexture(ctx);
}

/** Title lockup: gold letter-spaced kicker over a heavy italic glowing title. */
function makeTitleTexture(): CanvasTexture {
  const ctx = makeCanvas(1024, 230);
  if (ctx != null) {
    ctx.textBaseline = 'alphabetic';
    const kicker = 'TOO FAST TO WALL';
    ctx.font = '700 40px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
    const spacing = 16;
    let total = 0;
    for (const ch of kicker) {
      total += ctx.measureText(ch).width + spacing;
    }
    let x = (1024 - total + spacing) / 2;
    ctx.fillStyle = '#ffd60a';
    ctx.shadowColor = 'rgba(255,214,10,0.7)';
    ctx.shadowBlur = 14;
    for (const ch of kicker) {
      ctx.fillText(ch, x, 44);
      x += ctx.measureText(ch).width + spacing;
    }
    const title = 'WALL TONES 2';
    let font = 190;
    ctx.font = `italic 900 ${font}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
    while (ctx.measureText(title).width > 940 && font > 80) {
      font -= 6;
      ctx.font = `italic 900 ${font}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
    }
    const w = ctx.measureText(title).width;
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(90,150,255,0.95)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, (1024 - w) / 2, 205);
    ctx.shadowBlur = 8;
    ctx.fillText(title, (1024 - w) / 2, 205);
  }
  return toTexture(ctx);
}

/** Pad-grid layout slots in app-icon order: [column, row] with row 0 on top. */
const PAD_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], // green, top-left
  [1, 0], // red, top-right
  [0, 1], // blue, bottom-left
  [1, 1], // yellow, bottom-right
];

export class CoverStageSystem extends createSystem({}) {
  private root: Group | null = null;
  private padsGroup: Group | null = null;
  private glow: PointLight | null = null;
  private spectrumGroup: Group | null = null;
  private stripBacking: Mesh | null = null;
  private spectrumHeightScale = 1;
  private padFaceMaterials: MeshBasicMaterial[] = [];
  private padHaloMaterials: MeshBasicMaterial[] = [];
  private reflectionMaterials: MeshBasicMaterial[] = [];
  private rings: Mesh[] = [];
  private title: Mesh | null = null;
  private reflectionMeshes: Mesh[] = [];
  private layoutKey = '';
  private readonly tmpPos = new Vector3();
  private readonly tmpScale = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpUp = new Vector3();
  private notes: Mesh[] = [];
  private segments: InstancedMesh | null = null;
  private segmentColors: Color[] = [];
  private floorGlows: Mesh[] = [];
  private readonly dummy = new Object3D();
  private readonly tmpColor = new Color();
  private elapsed = 0;
  /** Per-pad orbit centers in world space, from the active layout. */
  private noteCenters: Array<{ x: number; y: number; z: number }> = [];
  private noteOrbitScale = 1;
  private layoutKind: 'grid' | 'focal' | 'mr' | null = null;
  private readonly onModeChanged = (event: Event): void => {
    const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
    this.setCoverVisible(mode === 'menu');
  };

  init(): void {
    const root = new Group();
    root.name = 'cover-stage';
    this.root = root;

    const planeGeometry = new PlaneGeometry(1, 1);
    const padsGroup = new Group();
    this.padsGroup = padsGroup;
    const streakTexture = makeStreakTexture();

    for (const pad of WALL_TONE_PADS) {
      const [column, row] = PAD_SLOTS[pad.id];
      const x = (column - 0.5) * 2 * PAD_OFFSET_M;
      const y = (0.5 - row) * 2 * PAD_OFFSET_M;

      const halo = new MeshBasicMaterial({
        map: makeHaloTexture(pad.color),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const haloMesh = new Mesh(planeGeometry, halo);
      haloMesh.scale.setScalar(PAD_SIZE_M * HALO_SCALE);
      haloMesh.position.set(x, y, -0.02);
      padsGroup.add(haloMesh);
      this.padHaloMaterials[pad.id] = halo;

      const face = new MeshBasicMaterial({
        map: makePadFaceTexture(pad.color, false),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const faceMesh = new Mesh(planeGeometry, face);
      faceMesh.scale.setScalar(PAD_SIZE_M * 1.18);
      faceMesh.position.set(x, y, 0);
      padsGroup.add(faceMesh);
      this.padFaceMaterials[pad.id] = face;

      if (row === 1) {
        // Glossy-floor look: a faded, flipped copy under the bottom row.
        // Drawn in the pad plane, so it needs no real floor (works in MR).
        const mirror = new MeshBasicMaterial({
          map: makePadFaceTexture(pad.color, true),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          side: DoubleSide,
        });
        const mirrorMesh = new Mesh(planeGeometry, mirror);
        mirrorMesh.scale.set(PAD_SIZE_M * 1.18, PAD_SIZE_M * 1.18, 1);
        mirrorMesh.rotation.x = Math.PI;
        mirrorMesh.position.set(x, y - PAD_SIZE_M * 1.18 * 0.97, -0.005);
        padsGroup.add(mirrorMesh);
        this.reflectionMeshes.push(mirrorMesh);
        this.reflectionMaterials.push(mirror);
        const pool = new MeshBasicMaterial({
          map: streakTexture,
          color: pad.color,
          transparent: true,
          opacity: 0.55,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const poolMesh = new Mesh(planeGeometry, pool);
        poolMesh.scale.set(PAD_SIZE_M * 1.9, PAD_SIZE_M * 0.28, 1);
        poolMesh.position.set(x, -PAD_EXTENT_M - 0.012, -0.01);
        padsGroup.add(poolMesh);
        this.reflectionMeshes.push(poolMesh);
        this.reflectionMaterials.push(pool);
      }
    }

    // Faint horizon line the pads appear to stand on.
    const horizon = new Mesh(
      planeGeometry,
      new MeshBasicMaterial({
        map: streakTexture,
        color: 0x7aa2ff,
        transparent: true,
        opacity: 0.4,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    horizon.scale.set(1.5, 0.05, 1);
    horizon.position.set(0, -PAD_EXTENT_M - 0.008, -0.015);
    padsGroup.add(horizon);
    this.reflectionMeshes.push(horizon);

    // Thin glowing light trails looping the pads, one per color.
    const ringGeometry = new RingGeometry(0.4, 0.405, 160, 1, 0, 2.4);
    for (const pad of WALL_TONE_PADS) {
      const holder = new Group();
      holder.rotation.x = 1.15 + pad.id * 0.04;
      holder.rotation.y = (pad.id - 1.5) * 0.18;
      const ring = new Mesh(
        ringGeometry,
        new MeshBasicMaterial({
          color: pad.color,
          transparent: true,
          opacity: 0.85,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          side: DoubleSide,
        }),
      );
      ring.scale.setScalar(1 + pad.id * 0.07);
      ring.rotation.z = pad.id * 1.7;
      holder.add(ring);
      padsGroup.add(holder);
      this.rings.push(ring);
    }

    // Title lockup above the pads (kicker + glowing title), per the mockup.
    const title = new Mesh(
      planeGeometry,
      new MeshBasicMaterial({
        map: makeTitleTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    title.scale.set(TITLE_WIDTH_M, TITLE_WIDTH_M / TITLE_ASPECT, 1);
    title.position.set(0, PAD_EXTENT_M + 0.075 + TITLE_WIDTH_M / TITLE_ASPECT / 2, 0);
    padsGroup.add(title);
    this.title = title;
    root.add(padsGroup);

    // Soft colored wash so the notes read as light sources on the dark floor.
    this.glow = new PointLight(0x9db4ff, 1.8, 5, 1.6);
    root.add(this.glow);

    // Musical notes circling the pads in 3D, one per pad color.
    const noteGeometry = makeNoteGeometry(0.16);
    for (const pad of WALL_TONE_PADS) {
      const material = new MeshStandardMaterial({
        color: pad.color,
        emissive: pad.color,
        emissiveIntensity: 0.9,
        roughness: 0.4,
        metalness: 0.1,
        side: DoubleSide,
      });
      const note = new Mesh(noteGeometry, material);
      note.scale.setScalar(NOTE_SIZE_M);
      root.add(note);
      this.notes.push(note);
    }

    // Segmented equalizer on the floor: four distinct color blocks.
    const segGeometry = new BoxGeometry(
      SPECTRUM_BAR_WIDTH_M,
      SPECTRUM_SEG_HEIGHT_M,
      SPECTRUM_BAR_WIDTH_M,
    );
    const segMaterial = new MeshBasicMaterial({ toneMapped: false });
    const segments = new InstancedMesh(
      segGeometry,
      segMaterial,
      SPECTRUM_BAR_COUNT * SPECTRUM_SEGMENTS,
    );
    segments.frustumCulled = false;
    this.segments = segments;
    const spectrumGroup = new Group();
    this.spectrumGroup = spectrumGroup;
    spectrumGroup.position.set(0, 0.005, SPECTRUM_SPLIT_Z_M);
    spectrumGroup.add(segments);
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i += 1) {
      const quarter = Math.min(
        SPECTRUM_PAD_ORDER.length - 1,
        Math.floor((i / SPECTRUM_BAR_COUNT) * SPECTRUM_PAD_ORDER.length),
      );
      this.segmentColors.push(new Color(padColorHex(SPECTRUM_PAD_ORDER[quarter])));
    }
    // Colored floor glow under each block (cheap stand-in for a reflection).
    for (let q = 0; q < SPECTRUM_PAD_ORDER.length; q += 1) {
      const glowMesh = new Mesh(
        planeGeometry,
        new MeshBasicMaterial({
          map: streakTexture,
          color: padColorHex(SPECTRUM_PAD_ORDER[q]),
          transparent: true,
          opacity: 0.4,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      glowMesh.rotation.x = -Math.PI / 2;
      const quarterWidth = SPECTRUM_WIDTH_M / SPECTRUM_PAD_ORDER.length;
      glowMesh.scale.set(quarterWidth * 1.05, 0.22, 1);
      glowMesh.position.set(
        -SPECTRUM_WIDTH_M / 2 + quarterWidth * (q + 0.5),
        0.001,
        0.14,
      );
      spectrumGroup.add(glowMesh);
      this.floorGlows.push(glowMesh);
    }
    root.add(spectrumGroup);

    // A faint dark disc under the strip so bars read on the glossy floor.
    const stripBacking = new Mesh(
      new PlaneGeometry(SPECTRUM_WIDTH_M + 0.2, 0.7),
      new MeshBasicMaterial({
        color: 0x05080d,
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
      }),
    );
    stripBacking.rotation.x = -Math.PI / 2;
    stripBacking.position.set(0, 0.004, SPECTRUM_SPLIT_Z_M + 0.1);
    this.stripBacking = stripBacking;
    root.add(stripBacking);

    this.world.scene.add(root);
    this.applyLayout(this.desiredLayoutKind());
    this.setCoverVisible(readStoredMode() === 'menu');
    window.addEventListener('experience-mode-changed', this.onModeChanged);
  }

  destroy(): void {
    window.removeEventListener('experience-mode-changed', this.onModeChanged);
    if (this.root != null) {
      this.world.scene.remove(this.root);
      this.root = null;
    }
  }

  private setCoverVisible(visible: boolean): void {
    if (this.root != null) {
      this.root.visible = visible;
    }
  }

  private desiredLayoutKind(): 'grid' | 'focal' | 'mr' {
    if (
      PREVIEW_MR ||
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive
    ) {
      return 'mr';
    }
    const camera = this.world.camera as { aspect?: number };
    const aspect = typeof camera.aspect === 'number' ? camera.aspect : 1;
    return aspect >= 1.05 ? 'focal' : 'grid';
  }

  /** Place pads, notes and the spectrum for the current screen shape. */
  private applyLayout(kind: 'grid' | 'focal' | 'mr'): void {
    const camera = this.world.camera as { aspect?: number };
    const key = `${kind}:${String(camera.aspect)}`;
    if (this.padsGroup == null || this.layoutKey === key) {
      return;
    }
    this.layoutKey = key;
    if (PREVIEW_MR) {
      // Screenshot-only: pull the flat camera back so the whole MR menu fits.
      (this.world.camera as { position: Vector3 }).position.set(0, 1.9, 3.2);
    }
    this.layoutKind = kind;
    const mr = kind === 'mr';
    const focal = kind === 'focal';
    const center = focal ? FOCAL_CENTER : PADS_CENTER;
    for (const mesh of this.reflectionMeshes) {
      mesh.visible = !mr;
    }
    this.padsGroup.position.set(center.x, center.y, center.z);
    this.padsGroup.lookAt(PADS_LOOK_AT.x, PADS_LOOK_AT.y, PADS_LOOK_AT.z);
    this.padsGroup.scale.setScalar(
      mr ? MR_GROUP_SCALE : focal ? FOCAL_GROUP_SCALE : GRID_GROUP_SCALE,
    );
    if (this.title != null) {
      const titleScale = focal || mr ? 1 : GRID_TITLE_SCALE;
      this.title.scale.set(
        TITLE_WIDTH_M * titleScale,
        (TITLE_WIDTH_M / TITLE_ASPECT) * titleScale,
        1,
      );
      this.title.position.y =
        PAD_EXTENT_M +
        0.075 +
        ((TITLE_WIDTH_M / TITLE_ASPECT) * titleScale) / 2 +
        (focal || mr ? 0 : GRID_TITLE_LIFT_M);
    }
    for (const pad of WALL_TONE_PADS) {
      this.noteCenters[pad.id] = { ...center };
    }
    const noteScale = focal ? FOCAL_NOTE_SCALE : mr ? 1.2 : 1;
    for (const note of this.notes) {
      note.scale.setScalar(NOTE_SIZE_M * noteScale);
    }
    this.noteOrbitScale = focal ? FOCAL_ORBIT_SCALE : mr ? MR_GROUP_SCALE : 1;
    if (this.glow != null) {
      this.glow.position.set(center.x, center.y + 0.4, center.z + 0.5);
    }
    this.layoutSpectrum(kind);
  }

  /**
   * Flat screens: put the waveform on the bottom edge of the frame by
   * intersecting the bottom-edge view rays with the floor, and widen it to
   * the frame at that depth. MR: hidden unless MR_SHOW_SPECTRUM.
   */
  private layoutSpectrum(kind: 'grid' | 'focal' | 'mr'): void {
    const group = this.spectrumGroup;
    if (group == null) {
      return;
    }
    const mr = kind === 'mr';
    group.visible = !mr || MR_SHOW_SPECTRUM;
    if (this.stripBacking != null) {
      // The dark backing disc is dropped: on the bottom edge it only cast
      // black wedges in the corners.
      this.stripBacking.visible = false;
    }
    let z = kind === 'focal' ? SPECTRUM_SPLIT_Z_M : SPECTRUM_GRID_Z_M;
    let scale = 1;
    const camera = this.world.camera;
    camera.updateMatrixWorld(true);
    const origin = camera.getWorldPosition(this.tmpPos.set(0, 0, 0)).clone();
    const hit = (ndcX: number): Vector3 | null => {
      const dir = new Vector3(ndcX, SPECTRUM_BOTTOM_NDC, 0.5)
        .unproject(camera)
        .sub(origin)
        .normalize();
      if (dir.y > -0.02) {
        return null;
      }
      return origin.clone().addScaledVector(dir, -origin.y / dir.y);
    };
    const center = hit(0);
    const edge = hit(1);
    if (!mr && center != null && edge != null) {
      z = center.z;
      scale = Math.max(0.3, (Math.abs(edge.x) * 0.88) / (SPECTRUM_WIDTH_M / 2));
    }
    this.spectrumHeightScale = mr
      ? 1
      : kind === 'focal'
        ? SPECTRUM_FLAT_HEIGHT_SCALE
        : 2.2;
    group.position.set(0, 0.005, z);
    group.scale.setScalar(scale);
    if (this.stripBacking != null) {
      this.stripBacking.position.set(0, 0.004, z + 0.1 * scale);
      this.stripBacking.scale.setScalar(scale);
    }
  }

  /** MR: float the pads just above the (player-following) menu panel. */
  private followMenuPanel(): void {
    const group = this.padsGroup;
    const object = this.world.getSceneEntity('main-menu-panel')?.object3D;
    if (group == null || object == null) {
      return;
    }
    object.getWorldPosition(this.tmpPos);
    object.getWorldQuaternion(this.tmpQuat);
    object.getWorldScale(this.tmpScale);
    const panelScale = Math.max(this.tmpScale.y, ZERO_SCALE_EPS);
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.tmpQuat);
    const lift =
      MR_PANEL_HALF_HEIGHT_UNITS * panelScale +
      MR_GAP_M +
      PAD_EXTENT_M * MR_GROUP_SCALE;
    group.position.copy(this.tmpPos).addScaledVector(this.tmpUp, lift);
    group.quaternion.copy(this.tmpQuat);
    for (const pad of WALL_TONE_PADS) {
      const c = this.noteCenters[pad.id];
      if (c != null) {
        c.x = group.position.x;
        c.y = group.position.y;
        c.z = group.position.z;
      }
    }
    if (this.glow != null) {
      this.glow.position.set(group.position.x, group.position.y + 0.4, group.position.z + 0.5);
    }
  }

  update(delta: number): void {
    if (this.root == null || !this.root.visible) {
      return;
    }
    this.elapsed += delta;
    const t = this.elapsed;
    this.applyLayout(this.desiredLayoutKind());
    // Flat dialogs use the tall framed panel; the pads would sit behind it.
    if (this.padsGroup != null) {
      this.padsGroup.visible =
        this.layoutKind === 'mr' || !isMainMenuDialogOpen();
      for (const note of this.notes) {
        note.visible = this.padsGroup.visible;
      }
    }
    if (this.layoutKind === 'mr') {
      this.followMenuPanel();
    }

    // Pads breathe, and flash one at a time in the opening-fanfare order.
    let flashSum = 0;
    for (const pad of WALL_TONE_PADS) {
      const face = this.padFaceMaterials[pad.id];
      const halo = this.padHaloMaterials[pad.id];
      if (face == null || halo == null) {
        continue;
      }
      const slot = SIMON_FANFARE_PAD_ORDER.indexOf(pad.id);
      const flash = slot < 0 ? 0 : fanfareFlash(slot, t, WALL_TONE_PADS.length);
      flashSum += flash;
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.3 + pad.id * 1.7);
      face.color.setScalar(0.92 + 0.08 * breathe + 0.5 * flash);
      halo.opacity = 0.8 + 0.15 * breathe + 0.5 * flash;
    }
    for (const material of this.reflectionMaterials) {
      material.opacity = 0.5 + 0.2 * Math.min(1, flashSum) + (material.blending === AdditiveBlending ? 0.05 : 0.3);
    }
    for (let i = 0; i < this.rings.length; i += 1) {
      this.rings[i].rotation.z += delta * (i % 2 === 0 ? 0.55 : -0.42);
    }

    // Notes circle their pad (grid center or split column) on tilted orbits.
    for (let i = 0; i < this.notes.length; i += 1) {
      const note = this.notes[i];
      const orbit = NOTE_ORBITS[i % NOTE_ORBITS.length];
      const position = noteOrbitPosition(orbit, t);
      const center = this.noteCenters[i] ?? PADS_CENTER;
      note.position.set(
        center.x + position.x * this.noteOrbitScale,
        center.y + position.y * this.noteOrbitScale,
        center.z + position.z * this.noteOrbitScale,
      );
      note.rotation.set(t * 0.6 + orbit.phase, t * 0.9 + orbit.phase * 2, 0);
    }

    this.updateSegments(t);
  }

  /** Lit segments per bar follow the bar height; tops are brightest. */
  private updateSegments(t: number): void {
    const mesh = this.segments;
    if (mesh == null) {
      return;
    }
    if (this.spectrumGroup?.visible === false) {
      return;
    }
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i += 1) {
      const height = spectrumBarHeight(i, t) * this.spectrumHeightScale;
      const lit = Math.max(
        1,
        Math.min(SPECTRUM_SEGMENTS, Math.round(height / SPECTRUM_SEG_PITCH_M)),
      );
      const x =
        -SPECTRUM_WIDTH_M / 2 +
        (i / (SPECTRUM_BAR_COUNT - 1)) * SPECTRUM_WIDTH_M;
      for (let k = 0; k < SPECTRUM_SEGMENTS; k += 1) {
        const index = i * SPECTRUM_SEGMENTS + k;
        this.dummy.position.set(
          x,
          k * SPECTRUM_SEG_PITCH_M + SPECTRUM_SEG_HEIGHT_M / 2,
          0,
        );
        this.dummy.scale.setScalar(k < lit ? 1 : 0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
        const shade = 0.55 + 0.7 * (k / Math.max(1, lit - 1));
        this.tmpColor.copy(this.segmentColors[i]).multiplyScalar(k < lit ? shade : 0);
        mesh.setColorAt(index, this.tmpColor);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor != null) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

function readStoredMode(): string {
  if (typeof sessionStorage === 'undefined') {
    return 'menu';
  }
  return sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu';
}
