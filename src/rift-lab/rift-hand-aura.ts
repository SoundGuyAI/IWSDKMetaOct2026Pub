/**
 * Hand energy aura for the Rift Lab (visual-only).
 *
 * Four-color spiral ribbons + ember sparks around each palm (mesh ribbons,
 * not 1px Lines). Denser on the firing hand. Optional experimental PointLight.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
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
const FILAMENT_SEGMENTS = 32;
const EMBER_COUNT = 40;

export interface HandAuraUpdate {
  left: Vector3 | null;
  right: Vector3 | null;
  firing: HandSide | null;
  energy01: number;
  timeSec: number;
  usePalmLight: boolean;
}

interface Filament {
  mesh: Mesh;
  pos: Float32Array;
  mat: MeshBasicMaterial;
  phase: number;
}

interface HandBundle {
  group: Group;
  filaments: Filament[];
  embers: Points;
  emberPos: Float32Array;
  emberSeeds: Float32Array;
  core: Sprite;
  light: PointLight;
}

function makeRibbonGeometry(segments: number, pos: Float32Array): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(indices);
  return geo;
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

    const filaments: Filament[] = [];
    for (let i = 0; i < FILAMENT_COUNT; i++) {
      const colorName = PAD_COLOR_NAMES[i % PAD_COLOR_NAMES.length];
      const pos = new Float32Array((FILAMENT_SEGMENTS + 1) * 6);
      const mat = new MeshBasicMaterial({
        color: neonPadHex(colorName),
        transparent: true,
        opacity: 0.95,
        blending: AdditiveBlending,
        // Palm depth occluders would otherwise eat the spiral near the hand.
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(makeRibbonGeometry(FILAMENT_SEGMENTS, pos), mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      filaments.push({ mesh, pos, mat, phase: (i / FILAMENT_COUNT) * Math.PI * 2 });
    }

    const emberPos = new Float32Array(EMBER_COUNT * 3);
    const emberCol = new Float32Array(EMBER_COUNT * 3);
    const emberSeeds = new Float32Array(EMBER_COUNT * 4);
    for (let i = 0; i < EMBER_COUNT; i++) {
      emberSeeds[i * 4] = Math.random();
      emberSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      emberSeeds[i * 4 + 2] = 0.4 + Math.random();
      emberSeeds[i * 4 + 3] = 0.025 + Math.random() * 0.06;
      const hex = neonPadHex(PAD_COLOR_NAMES[i % 4]);
      emberCol[i * 3] = Number.parseInt(hex.slice(1, 3), 16) / 255;
      emberCol[i * 3 + 1] = Number.parseInt(hex.slice(3, 5), 16) / 255;
      emberCol[i * 3 + 2] = Number.parseInt(hex.slice(5, 7), 16) / 255;
    }
    const emberGeo = new BufferGeometry();
    emberGeo.setAttribute('position', new Float32BufferAttribute(emberPos, 3));
    emberGeo.setAttribute('color', new Float32BufferAttribute(emberCol, 3));
    const embers = new Points(
      emberGeo,
      new PointsMaterial({
        size: 0.065,
        map: glowDotTexture(),
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.95,
        sizeAttenuation: true,
      }),
    );
    embers.frustumCulled = false;
    group.add(embers);

    const core = new Sprite(
      new SpriteMaterial({
        map: glowDotTexture(),
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.85,
      }),
    );
    core.scale.setScalar(0.1);
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
    const dens = firing ? 1 : 0.7;
    // Big enough glowy spiral that it reads past the palm occluders in XR.
    const radius = 0.09 + energy01 * 0.08 * dens;

    for (let i = 0; i < bundle.filaments.length; i++) {
      const f = bundle.filaments[i];
      f.mat.opacity = (firing ? 1 : 0.75) * Math.min(1, energy01 * 1.6);
      const spin = timeSec * (4.2 + i * 0.75) + f.phase;
      for (let k = 0; k <= FILAMENT_SEGMENTS; k++) {
        const u = k / FILAMENT_SEGMENTS;
        const ang = f.phase + u * Math.PI * 2 * 2.4 + spin;
        const rad = radius * (0.7 + 0.5 * Math.sin(u * 6 + spin));
        const y = (u - 0.5) * radius * 2.1;
        const cx = palm.x + Math.cos(ang) * rad;
        const cy = palm.y + y;
        const cz = palm.z + Math.sin(ang) * rad;
        const hw = 0.018 * dens * (1.1 - u * 0.3);
        const sx = -Math.sin(ang) * hw;
        const sz = Math.cos(ang) * hw;
        const o = k * 6;
        f.pos[o] = cx - sx;
        f.pos[o + 1] = cy;
        f.pos[o + 2] = cz - sz;
        f.pos[o + 3] = cx + sx;
        f.pos[o + 4] = cy;
        f.pos[o + 5] = cz + sz;
      }
      (f.mesh.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    for (let i = 0; i < EMBER_COUNT; i++) {
      if (!firing && i >= EMBER_COUNT / 2) {
        const o = i * 3;
        bundle.emberPos[o] = palm.x;
        bundle.emberPos[o + 1] = palm.y - 10;
        bundle.emberPos[o + 2] = palm.z;
        continue;
      }
      const seed = bundle.emberSeeds;
      const ang = seed[i * 4 + 1] + timeSec * seed[i * 4 + 2] * 3.4;
      const rad = seed[i * 4 + 3] * dens * (1.2 + 0.8 * energy01);
      const lift = ((seed[i * 4] + timeSec * 0.22) % 1) * radius * 1.8 - radius * 0.5;
      const o = i * 3;
      bundle.emberPos[o] = palm.x + Math.cos(ang) * rad;
      bundle.emberPos[o + 1] = palm.y + lift;
      bundle.emberPos[o + 2] = palm.z + Math.sin(ang) * rad;
    }
    (bundle.embers.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;

    bundle.core.position.copy(palm);
    bundle.core.scale.setScalar((firing ? 0.2 : 0.12) * (0.75 + 0.55 * energy01));
    (bundle.core.material as SpriteMaterial).opacity = firing ? 1 : 0.6;

    if (usePalmLight && firing) {
      bundle.light.visible = true;
      bundle.light.position.copy(palm);
      bundle.light.intensity = 0.4 + 0.25 * energy01;
      bundle.light.color.set(neonPadHex(PAD_COLOR_NAMES[Math.floor(timeSec / 0.55) % 4]));
      bundle.light.distance = 0.7;
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
