/**
 * Hand energy aura for the Rift Lab (visual-only).
 *
 * Four-color spiral filaments + ember sparks around each palm, denser on
 * the firing hand. Optional experimental PointLight while firing.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  PointLight,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { PAD_COLOR_NAMES, type HandSide } from './rift-energy.js';
import { glowDotTexture, neonPadHex } from './rift-note-visuals.js';

const FILAMENT_COUNT = 4;
const FILAMENT_SEGMENTS = 28;
const EMBER_COUNT = 24;

export interface HandAuraUpdate {
  left: Vector3 | null;
  right: Vector3 | null;
  /** Which palm is currently firing the seal beam, if any. */
  firing: HandSide | null;
  energy01: number;
  timeSec: number;
  /** Enable experimental local light on the firing palm. */
  usePalmLight: boolean;
}

interface HandBundle {
  group: Group;
  filaments: { line: Line; pos: Float32Array; mat: LineBasicMaterial; phase: number }[];
  embers: Points;
  emberPos: Float32Array;
  emberSeeds: Float32Array;
  core: Sprite;
  light: PointLight;
}

export class RiftHandAura {
  readonly root = new Group();
  private readonly left: HandBundle;
  private readonly right: HandBundle;

  constructor() {
    this.root.name = 'RiftHandAura';
    this.left = this.buildHand('left');
    this.right = this.buildHand('right');
    this.root.add(this.left.group, this.right.group);
  }

  private buildHand(side: HandSide): HandBundle {
    const group = new Group();
    group.name = `HandAura_${side}`;
    group.visible = false;

    const filaments: HandBundle['filaments'] = [];
    for (let i = 0; i < FILAMENT_COUNT; i++) {
      const colorName = PAD_COLOR_NAMES[i % PAD_COLOR_NAMES.length];
      const pos = new Float32Array((FILAMENT_SEGMENTS + 1) * 3);
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const mat = new LineBasicMaterial({
        color: neonPadHex(colorName),
        transparent: true,
        opacity: 0.78,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new Line(geo, mat);
      line.frustumCulled = false;
      group.add(line);
      filaments.push({
        line,
        pos,
        mat,
        phase: (i / FILAMENT_COUNT) * Math.PI * 2,
      });
    }

    const emberPos = new Float32Array(EMBER_COUNT * 3);
    const emberCol = new Float32Array(EMBER_COUNT * 3);
    const emberSeeds = new Float32Array(EMBER_COUNT * 4);
    for (let i = 0; i < EMBER_COUNT; i++) {
      emberSeeds[i * 4] = Math.random();
      emberSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      emberSeeds[i * 4 + 2] = 0.4 + Math.random();
      emberSeeds[i * 4 + 3] = 0.02 + Math.random() * 0.06;
      const hex = neonPadHex(PAD_COLOR_NAMES[i % 4]);
      // Parse via CSS color string into the buffer by temp Line material-free approach:
      const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
      const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
      const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
      emberCol[i * 3] = r;
      emberCol[i * 3 + 1] = g;
      emberCol[i * 3 + 2] = b;
    }
    const emberGeo = new BufferGeometry();
    emberGeo.setAttribute('position', new Float32BufferAttribute(emberPos, 3));
    emberGeo.setAttribute('color', new Float32BufferAttribute(emberCol, 3));
    const embers = new Points(
      emberGeo,
      new PointsMaterial({
        size: 0.028,
        map: glowDotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.85,
      }),
    );
    embers.frustumCulled = false;
    group.add(embers);

    const core = new Sprite(
      new SpriteMaterial({
        map: glowDotTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.55,
      }),
    );
    core.scale.setScalar(0.08);
    group.add(core);

    const light = new PointLight(0xffffff, 0, 0.55, 2);
    light.visible = false;
    group.add(light);

    return { group, filaments, embers, emberPos, emberSeeds, core, light };
  }

  private updateHand(
    bundle: HandBundle,
    palm: Vector3 | null,
    energy01: number,
    firing: boolean,
    timeSec: number,
    usePalmLight: boolean,
  ): void {
    if (palm == null || energy01 <= 0.02) {
      bundle.group.visible = false;
      bundle.light.visible = false;
      bundle.light.intensity = 0;
      return;
    }
    bundle.group.visible = true;
    const dens = firing ? 1 : 0.55;
    const radius = 0.045 + energy01 * 0.035 * dens;

    for (let i = 0; i < bundle.filaments.length; i++) {
      const f = bundle.filaments[i];
      f.mat.opacity = (firing ? 0.88 : 0.55) * Math.min(1, energy01 * 1.4);
      const spin = timeSec * (2.6 + i * 0.45) + f.phase;
      for (let k = 0; k <= FILAMENT_SEGMENTS; k++) {
        const u = k / FILAMENT_SEGMENTS;
        // Helix around the palm, slightly elongated along the local up.
        const ang = f.phase + u * Math.PI * 2 * 1.6 + spin;
        const rad = radius * (0.65 + 0.35 * Math.sin(u * 5 + spin));
        const y = (u - 0.5) * radius * 1.6;
        const o = k * 3;
        f.pos[o] = palm.x + Math.cos(ang) * rad;
        f.pos[o + 1] = palm.y + y;
        f.pos[o + 2] = palm.z + Math.sin(ang) * rad;
      }
      (f.line.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    for (let i = 0; i < EMBER_COUNT; i++) {
      // When not firing, only show half the embers to save fill.
      if (!firing && i >= EMBER_COUNT / 2) {
        const o = i * 3;
        bundle.emberPos[o] = palm.x;
        bundle.emberPos[o + 1] = palm.y - 10;
        bundle.emberPos[o + 2] = palm.z;
        continue;
      }
      const seed = bundle.emberSeeds;
      const ang = seed[i * 4 + 1] + timeSec * seed[i * 4 + 2] * 2.2;
      const rad = seed[i * 4 + 3] * dens * (0.7 + 0.5 * energy01);
      const lift = ((seed[i * 4] + timeSec * 0.15) % 1) * radius * 1.4 - radius * 0.4;
      const o = i * 3;
      bundle.emberPos[o] = palm.x + Math.cos(ang) * rad;
      bundle.emberPos[o + 1] = palm.y + lift;
      bundle.emberPos[o + 2] = palm.z + Math.sin(ang) * rad;
    }
    (bundle.embers.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;

    bundle.core.position.copy(palm);
    const coreScale = (firing ? 0.1 : 0.06) * (0.7 + 0.5 * energy01);
    bundle.core.scale.setScalar(coreScale);
    (bundle.core.material as SpriteMaterial).opacity = firing ? 0.85 : 0.4;

    if (usePalmLight && firing) {
      // Filament/ember positions are authored in world space under an identity
      // group, so the experimental palm light uses the same world palm point.
      bundle.light.visible = true;
      bundle.light.position.copy(palm);
      bundle.light.intensity = 0.35 + 0.25 * energy01;
      bundle.light.color.set(neonPadHex(PAD_COLOR_NAMES[Math.floor(timeSec * 0.8) % 4]));
      bundle.light.distance = 0.65;
    } else {
      bundle.light.visible = false;
      bundle.light.intensity = 0;
    }
  }

  update(state: HandAuraUpdate): void {
    this.updateHand(
      this.left,
      state.left,
      state.energy01,
      state.firing === 'left',
      state.timeSec,
      state.usePalmLight,
    );
    this.updateHand(
      this.right,
      state.right,
      state.energy01,
      state.firing === 'right',
      state.timeSec,
      state.usePalmLight,
    );
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
