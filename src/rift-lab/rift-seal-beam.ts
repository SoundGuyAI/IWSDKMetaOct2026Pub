/**
 * Layered Rift-sealing beam VFX (visual-only).
 *
 * Layers: hot core, colored spiral filaments, traveling orbit sparks,
 * palm emitter tangle, and impact flare. Palette cycles the four pad
 * colors with a mild hue/sat lift so the beam stays energetic in MR.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { PAD_COLOR_NAMES, type PadColorName } from './rift-energy.js';
import { glowDotTexture, neonPadHex } from './rift-note-visuals.js';

const CORE_SEGMENTS = 24;
const SPIRAL_COUNT = 3;
const SPIRAL_SEGMENTS = 48;
const SPARK_COUNT = 42;
const PALM_WISP_COUNT = 5;
const PALM_WISP_SEGMENTS = 10;
const BEAM_CYCLE_HZ = 0.42;

export interface SealBeamUpdate {
  origin: Vector3;
  end: Vector3;
  /** 0..1 when contacting a rift; drives impact flare. */
  hitStrength: number;
  /** Wall-local forward for impact billboard; null = face camera later. */
  timeSec: number;
  visible: boolean;
}

export class RiftSealBeam {
  readonly root = new Group();
  private readonly core: Line;
  private readonly corePos: Float32Array;
  private readonly coreMat: LineBasicMaterial;
  private readonly coreTube: Mesh;
  private readonly coreTubeMat: MeshBasicMaterial;
  private readonly spirals: { line: Line; pos: Float32Array; mat: LineBasicMaterial; phase: number; turns: number; radius: number }[] = [];
  private readonly sparks: Points;
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkSeeds: Float32Array;
  private readonly palmCore: Sprite;
  private readonly palmWisps: { line: Line; pos: Float32Array; mat: LineBasicMaterial; phase: number }[] = [];
  private readonly impact: Sprite;
  private readonly impactMat: SpriteMaterial;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpC = new Vector3();
  private readonly colorA = new Color();
  private readonly colorB = new Color();
  private readonly colorMix = new Color();
  private readonly white = new Color(1, 1, 1);
  private readonly padColors: Color[];

  constructor() {
    this.padColors = PAD_COLOR_NAMES.map((n) => new Color(neonPadHex(n)));
    this.root.name = 'RiftSealBeam';
    this.root.visible = false;

    this.corePos = new Float32Array((CORE_SEGMENTS + 1) * 3);
    const coreGeo = new BufferGeometry();
    coreGeo.setAttribute('position', new Float32BufferAttribute(this.corePos, 3));
    this.coreMat = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.core = new Line(coreGeo, this.coreMat);
    this.core.frustumCulled = false;
    this.root.add(this.core);

    // Soft volumetric core so the beam reads on Quest (1px lines wash out).
    // Keep some opacity with normal blending so the shaft survives bright rooms;
    // additive alone washed out against the white hub (same lesson as notes).
    this.coreTubeMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });
    this.coreTube = new Mesh(
      new CylinderGeometry(0.028, 0.016, 1, 12, 1, true),
      this.coreTubeMat,
    );
    this.coreTube.frustumCulled = false;
    this.root.add(this.coreTube);

    for (let i = 0; i < SPIRAL_COUNT; i++) {
      const pos = new Float32Array((SPIRAL_SEGMENTS + 1) * 3);
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const mat = new LineBasicMaterial({
        color: this.padColors[i % 4].clone(),
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new Line(geo, mat);
      line.frustumCulled = false;
      this.root.add(line);
      this.spirals.push({
        line,
        pos,
        mat,
        phase: (i / SPIRAL_COUNT) * Math.PI * 2,
        turns: 2.4 + i * 0.55,
        radius: 0.018 + i * 0.008,
      });
    }

    this.sparkPos = new Float32Array(SPARK_COUNT * 3);
    this.sparkCol = new Float32Array(SPARK_COUNT * 3);
    this.sparkSeeds = new Float32Array(SPARK_COUNT * 4);
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkSeeds[i * 4] = Math.random();
      this.sparkSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      this.sparkSeeds[i * 4 + 2] = 0.55 + Math.random() * 0.9;
      this.sparkSeeds[i * 4 + 3] = 0.012 + Math.random() * 0.03;
      const c = this.padColors[i % 4];
      this.sparkCol[i * 3] = c.r;
      this.sparkCol[i * 3 + 1] = c.g;
      this.sparkCol[i * 3 + 2] = c.b;
    }
    const sparkGeo = new BufferGeometry();
    sparkGeo.setAttribute('position', new Float32BufferAttribute(this.sparkPos, 3));
    sparkGeo.setAttribute('color', new Float32BufferAttribute(this.sparkCol, 3));
    this.sparks = new Points(
      sparkGeo,
      new PointsMaterial({
        size: 0.045,
        map: glowDotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.9,
      }),
    );
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);

    this.palmCore = new Sprite(
      new SpriteMaterial({
        map: glowDotTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 0.95,
      }),
    );
    this.palmCore.scale.setScalar(0.14);
    this.root.add(this.palmCore);

    for (let i = 0; i < PALM_WISP_COUNT; i++) {
      const pos = new Float32Array((PALM_WISP_SEGMENTS + 1) * 3);
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const mat = new LineBasicMaterial({
        color: this.padColors[i % 4].clone(),
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new Line(geo, mat);
      line.frustumCulled = false;
      this.root.add(line);
      this.palmWisps.push({ line, pos, mat, phase: (i / PALM_WISP_COUNT) * Math.PI * 2 });
    }

    this.impactMat = new SpriteMaterial({
      map: glowDotTexture(),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    this.impact = new Sprite(this.impactMat);
    this.impact.scale.setScalar(0.22);
    this.root.add(this.impact);
  }

  /** Sample cycling pad color with a mild sat/brightness lift. */
  private sampleBeamColor(t: number, out: Color): Color {
    const n = this.padColors.length;
    const x = ((t * BEAM_CYCLE_HZ) % n + n) % n;
    const i0 = Math.floor(x);
    const i1 = (i0 + 1) % n;
    const f = x - i0;
    this.colorA.copy(this.padColors[i0]);
    this.colorB.copy(this.padColors[i1]);
    out.copy(this.colorA).lerp(this.colorB, f);
    // Lift toward white for a hot core feel without washing out hue.
    out.lerp(this.white, 0.22);
    return out;
  }

  private orthonormalBasis(dir: Vector3, right: Vector3, up: Vector3): void {
    // Pick a stable perpendicular.
    if (Math.abs(dir.y) < 0.9) {
      right.set(0, 1, 0).cross(dir).normalize();
    } else {
      right.set(1, 0, 0).cross(dir).normalize();
    }
    up.copy(dir).cross(right).normalize();
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
    const len = Math.max(this.tmpA.length(), 0.05);
    this.tmpA.multiplyScalar(1 / len);
    this.orthonormalBasis(this.tmpA, this.tmpB, this.tmpC);

    const beamCol = this.sampleBeamColor(state.timeSec, this.colorMix);
    this.coreMat.color.copy(beamCol).lerp(this.white, 0.45);
    this.coreTubeMat.color.copy(beamCol).lerp(this.white, 0.35);
    (this.palmCore.material as SpriteMaterial).color.copy(beamCol);
    this.impactMat.color.copy(beamCol).lerp(this.white, 0.35);

    // Orient / scale the volumetric core along the beam axis.
    // lookAt aims local -Z; rotateX maps the Y-cylinder onto that axis.
    this.coreTube.position.copy(origin).addScaledVector(this.tmpA, len * 0.5);
    this.coreTube.scale.set(1, 1, 1);
    this.coreTube.lookAt(end);
    this.coreTube.rotateX(Math.PI / 2);
    this.coreTube.scale.set(1, len, 1);

    // Core: slight energetic wobble along the axis.
    for (let i = 0; i <= CORE_SEGMENTS; i++) {
      const u = i / CORE_SEGMENTS;
      const wobble = Math.sin(u * 18 + state.timeSec * 14) * 0.004 * (1 - Math.abs(u - 0.5) * 1.2);
      const px = origin.x + this.tmpA.x * len * u + this.tmpB.x * wobble;
      const py = origin.y + this.tmpA.y * len * u + this.tmpB.y * wobble;
      const pz = origin.z + this.tmpA.z * len * u + this.tmpB.z * wobble;
      const o = i * 3;
      this.corePos[o] = px;
      this.corePos[o + 1] = py;
      this.corePos[o + 2] = pz;
    }
    (this.core.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;

    // Spiral filaments in the four neon pad colors.
    for (let s = 0; s < this.spirals.length; s++) {
      const sp = this.spirals[s];
      const colName = PAD_COLOR_NAMES[s % PAD_COLOR_NAMES.length] as PadColorName;
      sp.mat.color.set(neonPadHex(colName));
      sp.mat.color.lerp(beamCol, 0.25);
      const spin = state.timeSec * (3.2 + s * 0.7) + sp.phase;
      for (let i = 0; i <= SPIRAL_SEGMENTS; i++) {
        const u = i / SPIRAL_SEGMENTS;
        const ang = sp.phase + u * sp.turns * Math.PI * 2 + spin;
        const rad = sp.radius * (0.7 + 0.3 * Math.sin(u * 9 + spin));
        const ox = this.tmpB.x * Math.cos(ang) + this.tmpC.x * Math.sin(ang);
        const oy = this.tmpB.y * Math.cos(ang) + this.tmpC.y * Math.sin(ang);
        const oz = this.tmpB.z * Math.cos(ang) + this.tmpC.z * Math.sin(ang);
        const o = i * 3;
        sp.pos[o] = origin.x + this.tmpA.x * len * u + ox * rad;
        sp.pos[o + 1] = origin.y + this.tmpA.y * len * u + oy * rad;
        sp.pos[o + 2] = origin.z + this.tmpA.z * len * u + oz * rad;
      }
      (sp.line.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    // Orbiting sparks traveling hand → rift.
    for (let i = 0; i < SPARK_COUNT; i++) {
      const seed = this.sparkSeeds;
      const speed = seed[i * 4 + 2];
      const u = (seed[i * 4] + state.timeSec * speed * 0.22) % 1;
      const ang = seed[i * 4 + 1] + state.timeSec * 4.5;
      const rad = seed[i * 4 + 3] * (0.8 + 0.4 * Math.sin(ang * 2));
      const ox = this.tmpB.x * Math.cos(ang) + this.tmpC.x * Math.sin(ang);
      const oy = this.tmpB.y * Math.cos(ang) + this.tmpC.y * Math.sin(ang);
      const oz = this.tmpB.z * Math.cos(ang) + this.tmpC.z * Math.sin(ang);
      const o = i * 3;
      this.sparkPos[o] = origin.x + this.tmpA.x * len * u + ox * rad;
      this.sparkPos[o + 1] = origin.y + this.tmpA.y * len * u + oy * rad;
      this.sparkPos[o + 2] = origin.z + this.tmpA.z * len * u + oz * rad;
      const c = this.padColors[i % 4];
      this.sparkCol[o] = c.r;
      this.sparkCol[o + 1] = c.g;
      this.sparkCol[o + 2] = c.b;
    }
    (this.sparks.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    (this.sparks.geometry.getAttribute('color') as Float32BufferAttribute).needsUpdate = true;

    // Palm emitter tangle.
    this.palmCore.position.copy(origin);
    const pulse = 0.11 + 0.04 * (0.5 + 0.5 * Math.sin(state.timeSec * 9));
    this.palmCore.scale.setScalar(pulse);
    for (let i = 0; i < this.palmWisps.length; i++) {
      const w = this.palmWisps[i];
      w.mat.color.copy(this.padColors[i % 4]);
      const spin = state.timeSec * (5 + i) + w.phase;
      for (let k = 0; k <= PALM_WISP_SEGMENTS; k++) {
        const u = k / PALM_WISP_SEGMENTS;
        const ang = w.phase + u * Math.PI * 2.4 + spin;
        const rad = 0.01 + u * 0.045;
        const along = u * 0.07;
        const o = k * 3;
        w.pos[o] =
          origin.x +
          this.tmpA.x * along +
          this.tmpB.x * Math.cos(ang) * rad +
          this.tmpC.x * Math.sin(ang) * rad;
        w.pos[o + 1] =
          origin.y +
          this.tmpA.y * along +
          this.tmpB.y * Math.cos(ang) * rad +
          this.tmpC.y * Math.sin(ang) * rad;
        w.pos[o + 2] =
          origin.z +
          this.tmpA.z * along +
          this.tmpB.z * Math.cos(ang) * rad +
          this.tmpC.z * Math.sin(ang) * rad;
      }
      (w.line.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    // Impact flare at the far end when hitting a rift.
    this.impact.position.copy(end);
    const hit = Math.max(0, Math.min(1, state.hitStrength));
    this.impactMat.opacity = hit * (0.55 + 0.35 * Math.sin(state.timeSec * 18));
    const impactScale = 0.12 + hit * 0.28;
    this.impact.scale.setScalar(impactScale);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
