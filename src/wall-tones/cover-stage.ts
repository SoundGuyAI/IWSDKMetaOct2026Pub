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
  BoxGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  createSystem,
} from '@iwsdk/core';
import { SIMON_FANFARE_PAD_ORDER, WALL_TONE_PADS } from './constants.js';
import {
  NOTE_ORBITS,
  SPECTRUM_BAR_COUNT,
  fanfareFlash,
  noteOrbitPosition,
  spectrumBarHeight,
} from './cover-stage-math.js';

const PAD_SIZE_M = 0.15;
const PAD_DEPTH_M = 0.05;
const PAD_GAP_M = 0.045;
/** Pad grid center on tall screens: hovering above the menu panel, which
 * fills most of a phone frame below it. */
const PADS_CENTER = { x: 0, y: 2.0, z: -2.3 };
/** Wide screens: the pads are the cover's focal artwork, a large glowing
 * grid floating above the shrunken menu panel (MAIN_MENU_DESKTOP in
 * panel.ts). */
const FOCAL_CENTER = { x: 0, y: 2.25, z: -1.9 };
const FOCAL_PAD_SCALE = 1.7;
const FOCAL_PAD_OFFSET_M = 0.165;
const FOCAL_ORBIT_SCALE = 0.85;
const FOCAL_NOTE_SCALE = 1.6;
/** Spectrum placement per layout: on tall screens it sits on the floor under
 * the menu; on wide screens the panel hides anything past z ~ -1.35, so the
 * strip moves in front of it with shorter bars that stay under its bottom
 * edge. */
const SPECTRUM_GRID_Z_M = -2.3;
const SPECTRUM_SPLIT_Z_M = -1.2;
const SPECTRUM_SPLIT_HEIGHT_SCALE = 0.75;
/** What the pads face: the flat-mode camera, also the VR spawn area. */
const PADS_LOOK_AT = { x: 0, y: 1.6, z: 1 };
const NOTE_SIZE_M = 0.11;
const SPECTRUM_WIDTH_M = 3.0;
const SPECTRUM_Z_M = -2.3;
const SPECTRUM_BAR_WIDTH_M = 0.042;

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
  private padMaterials: MeshStandardMaterial[] = [];
  private padMeshes: Mesh[] = [];
  private notes: Mesh[] = [];
  private spectrumBars: Mesh[] = [];
  private elapsed = 0;
  /** Per-pad orbit centers in world space, from the active layout. */
  private noteCenters: Array<{ x: number; y: number; z: number }> = [];
  private noteOrbitScale = 1;
  private layoutKind: 'grid' | 'focal' | null = null;
  private readonly onModeChanged = (event: Event): void => {
    const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
    this.setCoverVisible(mode === 'menu');
  };

  init(): void {
    const root = new Group();
    root.name = 'cover-stage';
    this.root = root;

    const padGeometry = new BoxGeometry(PAD_SIZE_M, PAD_SIZE_M, PAD_DEPTH_M);
    const padsGroup = new Group();
    this.padsGroup = padsGroup;
    for (const pad of WALL_TONE_PADS) {
      const base = new Color(pad.color).multiplyScalar(0.55);
      const material = new MeshStandardMaterial({
        color: base,
        emissive: pad.color,
        emissiveIntensity: 0.45,
        roughness: 0.32,
        metalness: 0.1,
      });
      const mesh = new Mesh(padGeometry, material);
      padsGroup.add(mesh);
      this.padMaterials[pad.id] = material;
      this.padMeshes[pad.id] = mesh;
    }
    root.add(padsGroup);

    // Soft colored wash so the pads read as light sources on the dark floor.
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

    // Animated spectrum strip on the floor, below the menu.
    const barGeometry = new BoxGeometry(SPECTRUM_BAR_WIDTH_M, 1, SPECTRUM_BAR_WIDTH_M);
    barGeometry.translate(0, 0.5, 0); // scale.y grows upward from the floor
    const spectrumGroup = new Group();
    this.spectrumGroup = spectrumGroup;
    spectrumGroup.position.set(0, 0.005, SPECTRUM_Z_M);
    const spectrumColors = WALL_TONE_PADS.map((pad) => new Color(pad.color));
    for (let i = 0; i < SPECTRUM_BAR_COUNT; i += 1) {
      // Green -> red -> blue -> yellow gradient across the strip.
      const blend = (i / (SPECTRUM_BAR_COUNT - 1)) * (spectrumColors.length - 1);
      const lower = Math.min(Math.floor(blend), spectrumColors.length - 2);
      const color = spectrumColors[lower]
        .clone()
        .lerp(spectrumColors[lower + 1], blend - lower);
      const material = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      });
      const bar = new Mesh(barGeometry, material);
      bar.position.x =
        -SPECTRUM_WIDTH_M / 2 +
        (i / (SPECTRUM_BAR_COUNT - 1)) * SPECTRUM_WIDTH_M;
      spectrumGroup.add(bar);
      this.spectrumBars.push(bar);
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
    stripBacking.position.set(0, 0.004, SPECTRUM_Z_M + 0.1);
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

  private desiredLayoutKind(): 'grid' | 'focal' {
    const camera = this.world.camera as { aspect?: number };
    const aspect = typeof camera.aspect === 'number' ? camera.aspect : 1;
    return aspect >= 1.05 ? 'focal' : 'grid';
  }

  /** Place pads, notes and the spectrum for the current screen shape. */
  private applyLayout(kind: 'grid' | 'focal'): void {
    if (this.padsGroup == null || this.layoutKind === kind) {
      return;
    }
    this.layoutKind = kind;
    const focal = kind === 'focal';
    const padStep = (PAD_SIZE_M + PAD_GAP_M) / 2;
    const padScale = focal ? FOCAL_PAD_SCALE : 1;
    const padOffset = focal ? FOCAL_PAD_OFFSET_M : padStep;
    const center = focal ? FOCAL_CENTER : PADS_CENTER;
    this.padsGroup.position.set(center.x, center.y, center.z);
    this.padsGroup.lookAt(PADS_LOOK_AT.x, PADS_LOOK_AT.y, PADS_LOOK_AT.z);
    for (const pad of WALL_TONE_PADS) {
      const mesh = this.padMeshes[pad.id];
      if (mesh == null) {
        continue;
      }
      const [column, row] = PAD_SLOTS[pad.id];
      mesh.scale.setScalar(padScale);
      mesh.position.set(
        (column - 0.5) * 2 * padOffset,
        (0.5 - row) * 2 * padOffset,
        0,
      );
      this.noteCenters[pad.id] = { ...center };
    }
    const noteScale = focal ? FOCAL_NOTE_SCALE : 1;
    for (const note of this.notes) {
      note.scale.setScalar(NOTE_SIZE_M * noteScale);
    }
    this.noteOrbitScale = focal ? FOCAL_ORBIT_SCALE : 1;
    if (this.glow != null) {
      this.glow.position.set(center.x, center.y + 0.4, center.z + 0.5);
    }
    const spectrumZ = focal ? SPECTRUM_SPLIT_Z_M : SPECTRUM_GRID_Z_M;
    this.spectrumHeightScale = focal ? SPECTRUM_SPLIT_HEIGHT_SCALE : 1;
    if (this.spectrumGroup != null) {
      this.spectrumGroup.position.set(0, 0.005, spectrumZ);
    }
    if (this.stripBacking != null) {
      this.stripBacking.position.set(0, 0.004, spectrumZ + 0.1);
    }
  }

  update(delta: number): void {
    if (this.root == null || !this.root.visible) {
      return;
    }
    this.elapsed += delta;
    const t = this.elapsed;
    this.applyLayout(this.desiredLayoutKind());

    // Pads breathe, and flash one at a time in the opening-fanfare order.
    for (const pad of WALL_TONE_PADS) {
      const material = this.padMaterials[pad.id];
      if (material == null) {
        continue;
      }
      const slot = SIMON_FANFARE_PAD_ORDER.indexOf(pad.id);
      const flash = slot < 0 ? 0 : fanfareFlash(slot, t, WALL_TONE_PADS.length);
      material.emissiveIntensity =
        0.45 + 0.08 * Math.sin(t * 1.3 + pad.id * 1.7) + 1.4 * flash;
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

    for (let i = 0; i < this.spectrumBars.length; i += 1) {
      this.spectrumBars[i].scale.y =
        spectrumBarHeight(i, t) * this.spectrumHeightScale;
    }
  }
}

function readStoredMode(): string {
  if (typeof sessionStorage === 'undefined') {
    return 'menu';
  }
  return sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu';
}
