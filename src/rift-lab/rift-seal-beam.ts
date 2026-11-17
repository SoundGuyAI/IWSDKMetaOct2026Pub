/**
 * Layered Rift-sealing beam VFX (visual-only).
 *
 * Refs 3 / 15: thin electrical core + many thin corkscrew light-threads,
 * palm flare/wisps, orbit sparks, impact. Fat cylinders wash out the
 * spirals on Quest, so the core stays thin and the threads dominate.
 * Beam color holds one pad color per beat, then steps to the next.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { PAD_COLOR_NAMES } from './rift-energy.js';
import { glowDotTexture, neonPadHex } from './rift-note-visuals.js';

/** Dense corkscrew strands that wrap the shaft (ref light-paint threads). */
const SPIRAL_COUNT = 10;
const SPIRAL_SEGMENTS = 56;
/** Mesh motes traveling hand → hit (Quest draws WebGL points as ~1px). */
const WISP_COUNT = 36;
const PALM_WISP_COUNT = 8;
const PALM_WISP_SEGMENTS = 18;
/** Hold each pad color this long, then snap to the next (not a gradual lerp). */
const COLOR_BEAT_SEC = 0.55;

export interface SealBeamUpdate {
  origin: Vector3;
  end: Vector3;
  /** 0..1 at a rift or other surface; drives the impact flare. */
  hitStrength: number;
  timeSec: number;
  visible: boolean;
}

interface Ribbon {
  mesh: Mesh;
  pos: Float32Array;
  mat: MeshBasicMaterial;
  phase: number;
  turns: number;
  radius: number;
  halfWidth: number;
  spinRate: number;
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

function writeRibbonSegment(
  pos: Float32Array,
  i: number,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const o = i * 6;
  pos[o] = cx - sx;
  pos[o + 1] = cy - sy;
  pos[o + 2] = cz - sz;
  pos[o + 3] = cx + sx;
  pos[o + 4] = cy + sy;
  pos[o + 5] = cz + sz;
}

export class RiftSealBeam {
  readonly root = new Group();
  private readonly coreInner: Mesh;
  private readonly coreOuter: Mesh;
  private readonly coreInnerMat: MeshBasicMaterial;
  private readonly coreOuterMat: MeshBasicMaterial;
  private readonly spirals: Ribbon[] = [];
  private readonly wispSprites: Sprite[] = [];
  private readonly wispSeeds: Float32Array;
  private readonly palmCore: Sprite;
  private readonly palmHalo: Sprite;
  private readonly palmWisps: Ribbon[] = [];
  private readonly impact: Sprite;
  private readonly impactMat: SpriteMaterial;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpC = new Vector3();
  private readonly tmpSide = new Vector3();
  private readonly yUp = new Vector3(0, 1, 0);
  private readonly colorMix = new Color();
  private readonly white = new Color(1, 1, 1);
  private readonly padColors: Color[];

  constructor() {
    this.padColors = PAD_COLOR_NAMES.map((n) => new Color(neonPadHex(n)));
    this.root.name = 'RiftSealBeam';
    this.root.visible = false;

    // Thin hot core — threads must win the silhouette (capture was a fat tube).
    this.coreInnerMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });
    this.coreOuterMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });
    this.coreInner = new Mesh(
      new CylinderGeometry(0.007, 0.005, 1, 10, 1, true),
      this.coreInnerMat,
    );
    this.coreOuter = new Mesh(
      new CylinderGeometry(0.018, 0.014, 1, 12, 1, true),
      this.coreOuterMat,
    );
    this.coreInner.frustumCulled = false;
    this.coreOuter.frustumCulled = false;
    this.root.add(this.coreOuter, this.coreInner);

    for (let i = 0; i < SPIRAL_COUNT; i++) {
      const pos = new Float32Array((SPIRAL_SEGMENTS + 1) * 6);
      const mat = new MeshBasicMaterial({
        color: this.padColors[i % 4].clone(),
        transparent: true,
        opacity: 0.85 + (i % 3) * 0.05,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(makeRibbonGeometry(SPIRAL_SEGMENTS, pos), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.root.add(mesh);
      // Tight corkscrews outside the thin core; staggered radii / turns.
      const ring = i % 5;
      this.spirals.push({
        mesh,
        pos,
        mat,
        phase: (i / SPIRAL_COUNT) * Math.PI * 2,
        turns: 3.2 + ring * 0.45 + (i % 2) * 0.55,
        radius: 0.055 + ring * 0.016 + (i % 3) * 0.008,
        halfWidth: 0.012 + (i % 4) * 0.0035,
        spinRate: 4.2 + (i % 5) * 0.85 + (i % 2) * 1.1,
      });
    }

    // Billboard motes in three speed bands (hand → hit). Mesh sprites, not points.
    this.wispSeeds = new Float32Array(WISP_COUNT * 4);
    for (let i = 0; i < WISP_COUNT; i++) {
      this.wispSeeds[i * 4] = Math.random();
      this.wispSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      const band = i % 3;
      this.wispSeeds[i * 4 + 2] =
        band === 0 ? 0.35 + Math.random() * 0.15
        : band === 1 ? 0.6 + Math.random() * 0.25
        : 0.95 + Math.random() * 0.4;
      this.wispSeeds[i * 4 + 3] = 0.02 + Math.random() * 0.045;
      const sprite = new Sprite(
        new SpriteMaterial({
          map: glowDotTexture(),
          color: this.padColors[i % 4].clone(),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
          opacity: 0.95,
        }),
      );
      sprite.frustumCulled = false;
      sprite.renderOrder = 3;
      sprite.scale.setScalar(0.07);
      this.root.add(sprite);
      this.wispSprites.push(sprite);
    }

    this.palmCore = new Sprite(
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
    // Kept so older call sites stay valid; the big white disc read as a
    // detached orb on Quest, so it stays hidden.
    this.palmHalo = new Sprite(
      new SpriteMaterial({
        map: glowDotTexture(),
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0,
      }),
    );
    this.palmHalo.visible = false;
    this.palmCore.scale.setScalar(0.05);
    this.root.add(this.palmCore);

    for (let i = 0; i < PALM_WISP_COUNT; i++) {
      const pos = new Float32Array((PALM_WISP_SEGMENTS + 1) * 6);
      const mat = new MeshBasicMaterial({
        color: this.padColors[i % 4].clone(),
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(makeRibbonGeometry(PALM_WISP_SEGMENTS, pos), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.root.add(mesh);
      this.palmWisps.push({
        mesh,
        pos,
        mat,
        phase: (i / PALM_WISP_COUNT) * Math.PI * 2,
        turns: 2.4 + (i % 3) * 0.4,
        radius: 0.09 + (i % 4) * 0.02,
        halfWidth: 0.012 + (i % 3) * 0.004,
        spinRate: 7 + i * 1.2,
      });
    }

    this.impactMat = new SpriteMaterial({
      map: glowDotTexture(),
      color: 0xffffff,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    this.impact = new Sprite(this.impactMat);
    this.impact.scale.setScalar(0.32);
    this.root.add(this.impact);
  }

  /** One pad color per beat, then step — no gradual hue slide. */
  private sampleBeamColor(t: number, out: Color): Color {
    const n = this.padColors.length;
    const beat = Math.floor(t / COLOR_BEAT_SEC);
    const idx = ((beat % n) + n) % n;
    out.copy(this.padColors[idx]);
    const phase = (t / COLOR_BEAT_SEC) % 1;
    if (phase < 0.12) {
      out.lerp(this.white, 0.55 * (1 - phase / 0.12));
    } else {
      out.lerp(this.white, 0.18);
    }
    return out;
  }

  private orthonormalBasis(dir: Vector3, right: Vector3, up: Vector3): void {
    if (Math.abs(dir.y) < 0.9) {
      right.set(0, 1, 0).cross(dir).normalize();
    } else {
      right.set(1, 0, 0).cross(dir).normalize();
    }
    up.copy(dir).cross(right).normalize();
  }

  private placeTube(mesh: Mesh, origin: Vector3, dir: Vector3, len: number): void {
    mesh.position.copy(origin).addScaledVector(dir, len * 0.5);
    mesh.quaternion.setFromUnitVectors(this.yUp, dir);
    const sx = mesh.scale.x;
    const sz = mesh.scale.z;
    mesh.scale.set(sx || 1, len, sz || 1);
  }

  update(state: SealBeamUpdate): void {
    this.root.visible = state.visible;
    if (!state.visible) {
      this.impactMat.opacity = 0;
      return;
    }

    const origin = state.origin;
    const end = state.end;
    this.tmpA.copy(end).sub(origin);
    const len = Math.max(this.tmpA.length(), 0.08);
    this.tmpA.multiplyScalar(1 / len);
    this.orthonormalBasis(this.tmpA, this.tmpB, this.tmpC);

    const beamCol = this.sampleBeamColor(state.timeSec, this.colorMix);
    this.coreInnerMat.color.copy(beamCol).lerp(this.white, 0.7);
    this.coreOuterMat.color.copy(beamCol).lerp(this.white, 0.25);
    (this.palmCore.material as SpriteMaterial).color.copy(beamCol).lerp(this.white, 0.55);
    (this.palmHalo.material as SpriteMaterial).color.copy(beamCol);
    this.impactMat.color.copy(beamCol).lerp(this.white, 0.45);

    this.coreInner.scale.set(1, 1, 1);
    this.coreOuter.scale.set(1, 1, 1);
    this.placeTube(this.coreInner, origin, this.tmpA, len);
    this.placeTube(this.coreOuter, origin, this.tmpA, len);
    this.coreOuter.scale.x = 1.05;
    this.coreOuter.scale.z = 1.05;

    // Corkscrew threads wrapping the thin shaft.
    for (let s = 0; s < this.spirals.length; s++) {
      const sp = this.spirals[s];
      sp.mat.color.copy(this.padColors[s % 4]);
      // Beat color accents a couple of leading strands.
      if (s < 2) sp.mat.color.copy(beamCol).lerp(this.white, 0.35);
      const spin = state.timeSec * sp.spinRate + sp.phase;
      for (let i = 0; i <= SPIRAL_SEGMENTS; i++) {
        const u = i / SPIRAL_SEGMENTS;
        const ang = sp.phase + u * sp.turns * Math.PI * 2 + spin;
        // Light wobble so threads feel alive, not like a rigid spring.
        const rad =
          sp.radius *
          (0.92 + 0.18 * Math.sin(u * 13 + spin * 1.1 + s) + 0.08 * Math.sin(spin * 2.3 + u * 7));
        const cx =
          origin.x +
          this.tmpA.x * len * u +
          this.tmpB.x * Math.cos(ang) * rad +
          this.tmpC.x * Math.sin(ang) * rad;
        const cy =
          origin.y +
          this.tmpA.y * len * u +
          this.tmpB.y * Math.cos(ang) * rad +
          this.tmpC.y * Math.sin(ang) * rad;
        const cz =
          origin.z +
          this.tmpA.z * len * u +
          this.tmpB.z * Math.cos(ang) * rad +
          this.tmpC.z * Math.sin(ang) * rad;
        this.tmpSide
          .copy(this.tmpB)
          .multiplyScalar(Math.cos(ang + Math.PI / 2))
          .addScaledVector(this.tmpC, Math.sin(ang + Math.PI / 2))
          .normalize()
          .multiplyScalar(sp.halfWidth);
        writeRibbonSegment(sp.pos, i, cx, cy, cz, this.tmpSide.x, this.tmpSide.y, this.tmpSide.z);
      }
      (sp.mesh.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    // Colored motes traveling hand → hit. Sprites stay visible on Quest.
    for (let i = 0; i < WISP_COUNT; i++) {
      const seed = this.wispSeeds;
      const speed = seed[i * 4 + 2];
      const u = (seed[i * 4] + state.timeSec * speed) % 1;
      const ang = seed[i * 4 + 1] + state.timeSec * (1.6 + (i % 3) * 0.5);
      const rad = seed[i * 4 + 3] * (1.15 + 0.55 * Math.sin(ang * 1.6 + u * 4));
      const sprite = this.wispSprites[i]!;
      sprite.position.set(
        origin.x + this.tmpA.x * len * u + this.tmpB.x * Math.cos(ang) * rad + this.tmpC.x * Math.sin(ang) * rad,
        origin.y + this.tmpA.y * len * u + this.tmpB.y * Math.cos(ang) * rad + this.tmpC.y * Math.sin(ang) * rad,
        origin.z + this.tmpA.z * len * u + this.tmpB.z * Math.cos(ang) * rad + this.tmpC.z * Math.sin(ang) * rad,
      );
      const fade = Math.min(1, u * 6, (1 - u) * 4);
      const mat = sprite.material as SpriteMaterial;
      mat.color.copy(i % 3 === 0 ? this.padColors[i % 4]! : beamCol);
      mat.opacity = 0.35 + 0.65 * fade;
      sprite.scale.setScalar(0.055 + 0.03 * fade);
      sprite.visible = fade > 0.05;
    }

    // Small palm flare. The old half-meter white halo read as a floating orb.
    this.palmCore.position.copy(origin);
    const pulse = 0.045 + 0.012 * Math.sin(state.timeSec * 12);
    this.palmCore.scale.setScalar(pulse);
    for (let i = 0; i < this.palmWisps.length; i++) {
      const w = this.palmWisps[i];
      w.mat.color.copy(this.padColors[i % 4]);
      const spin = state.timeSec * w.spinRate + w.phase;
      for (let k = 0; k <= PALM_WISP_SEGMENTS; k++) {
        const u = k / PALM_WISP_SEGMENTS;
        const ang = w.phase + u * Math.PI * 3.8 + spin + Math.sin(u * 9 + spin) * 0.55;
        const rad = 0.035 + u * (0.16 + (i % 3) * 0.04) * (0.85 + 0.3 * Math.sin(spin + u * 5));
        const along = u * 0.32;
        const cx =
          origin.x +
          this.tmpA.x * along +
          this.tmpB.x * Math.cos(ang) * rad +
          this.tmpC.x * Math.sin(ang) * rad;
        const cy =
          origin.y +
          this.tmpA.y * along +
          this.tmpB.y * Math.cos(ang) * rad +
          this.tmpC.y * Math.sin(ang) * rad;
        const cz =
          origin.z +
          this.tmpA.z * along +
          this.tmpB.z * Math.cos(ang) * rad +
          this.tmpC.z * Math.sin(ang) * rad;
        this.tmpSide
          .copy(this.tmpB)
          .multiplyScalar(Math.cos(ang + 1.1))
          .addScaledVector(this.tmpC, Math.sin(ang + 1.1))
          .normalize()
          .multiplyScalar(w.halfWidth * (1.15 - u * 0.55));
        writeRibbonSegment(w.pos, k, cx, cy, cz, this.tmpSide.x, this.tmpSide.y, this.tmpSide.z);
      }
      (w.mesh.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    this.impact.position.copy(end);
    const hit = Math.max(0, Math.min(1, state.hitStrength));
    this.impactMat.opacity = hit * (0.7 + 0.3 * Math.sin(state.timeSec * 20));
    this.impact.scale.setScalar(0.08 + hit * 0.16);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
