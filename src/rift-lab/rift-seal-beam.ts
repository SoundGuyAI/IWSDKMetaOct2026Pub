/**
 * Layered Rift-sealing beam VFX (visual-only).
 *
 * WebGL Lines are ~1px on Quest/desktop, so every energetic layer is a real
 * mesh: hot core tubes, wide spiral ribbons, orbit sparks, palm burst, impact.
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
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { PAD_COLOR_NAMES } from './rift-energy.js';
import { glowDotTexture, neonPadHex } from './rift-note-visuals.js';

const SPIRAL_COUNT = 4;
const SPIRAL_SEGMENTS = 48;
const SPARK_COUNT = 72;
const PALM_WISP_COUNT = 4;
const PALM_WISP_SEGMENTS = 16;
/** Hold each pad color this long, then snap to the next (not a gradual lerp). */
const COLOR_BEAT_SEC = 0.55;

export interface SealBeamUpdate {
  origin: Vector3;
  end: Vector3;
  /** 0..1 when contacting a rift; drives impact flare. */
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
}

function makeRibbonGeometry(segments: number, pos: Float32Array): BufferGeometry {
  // Triangle strip as indexed tris: 2 verts per segment → (segments)*2 tris.
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
  private readonly sparks: Points;
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkSeeds: Float32Array;
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

    this.coreInnerMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });
    this.coreOuterMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });
    this.coreInner = new Mesh(
      new CylinderGeometry(0.018, 0.012, 1, 12, 1, true),
      this.coreInnerMat,
    );
    this.coreOuter = new Mesh(
      new CylinderGeometry(0.045, 0.032, 1, 14, 1, true),
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
        opacity: 0.95,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(makeRibbonGeometry(SPIRAL_SEGMENTS, pos), mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.spirals.push({
        mesh,
        pos,
        mat,
        phase: (i / SPIRAL_COUNT) * Math.PI * 2,
        turns: 3.0 + i * 0.85,
        // Wide enough to read past the core tubes in XR.
        radius: 0.07 + i * 0.035,
        halfWidth: 0.016 + i * 0.006,
      });
    }

    this.sparkPos = new Float32Array(SPARK_COUNT * 3);
    this.sparkCol = new Float32Array(SPARK_COUNT * 3);
    this.sparkSeeds = new Float32Array(SPARK_COUNT * 4);
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkSeeds[i * 4] = Math.random();
      this.sparkSeeds[i * 4 + 1] = Math.random() * Math.PI * 2;
      this.sparkSeeds[i * 4 + 2] = 0.55 + Math.random() * 0.9;
      this.sparkSeeds[i * 4 + 3] = 0.03 + Math.random() * 0.05;
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
        size: 0.1,
        map: glowDotTexture(),
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 1,
        sizeAttenuation: true,
      }),
    );
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);

    this.palmCore = new Sprite(
      new SpriteMaterial({
        map: glowDotTexture(),
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        opacity: 1,
      }),
    );
    this.palmHalo = new Sprite(
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
    this.palmCore.scale.setScalar(0.22);
    this.palmHalo.scale.setScalar(0.4);
    this.root.add(this.palmHalo, this.palmCore);

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
      this.root.add(mesh);
      this.palmWisps.push({
        mesh,
        pos,
        mat,
        phase: (i / PALM_WISP_COUNT) * Math.PI * 2,
        turns: 2.2,
        radius: 0.09,
        halfWidth: 0.018,
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
    this.impact.scale.setScalar(0.28);
    this.root.add(this.impact);
  }

  /** One pad color per beat, then step — no gradual hue slide. */
  private sampleBeamColor(t: number, out: Color): Color {
    const n = this.padColors.length;
    const beat = Math.floor(t / COLOR_BEAT_SEC);
    const idx = ((beat % n) + n) % n;
    out.copy(this.padColors[idx]);
    // Brief hot flash at the start of each beat so the change reads.
    const phase = (t / COLOR_BEAT_SEC) % 1;
    if (phase < 0.12) {
      out.lerp(this.white, 0.55 * (1 - phase / 0.12));
    } else {
      out.lerp(this.white, 0.12);
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
    this.coreInnerMat.color.copy(beamCol).lerp(this.white, 0.55);
    this.coreOuterMat.color.copy(beamCol);
    (this.palmCore.material as SpriteMaterial).color.copy(beamCol).lerp(this.white, 0.4);
    (this.palmHalo.material as SpriteMaterial).color.copy(beamCol);
    this.impactMat.color.copy(beamCol).lerp(this.white, 0.35);

    this.coreInner.scale.set(1, 1, 1);
    this.coreOuter.scale.set(1, 1, 1);
    this.placeTube(this.coreInner, origin, this.tmpA, len);
    this.placeTube(this.coreOuter, origin, this.tmpA, len);
    // Outer glow a bit thicker than the unit cylinder radius.
    this.coreOuter.scale.x = 1.15;
    this.coreOuter.scale.z = 1.15;

    // Spiral ribbons wrapping the shaft.
    for (let s = 0; s < this.spirals.length; s++) {
      const sp = this.spirals[s];
      sp.mat.color.copy(this.padColors[s % 4]);
      // Active beat color dominates the leading spiral.
      if (s === 0) sp.mat.color.copy(beamCol);
      const spin = state.timeSec * (5.5 + s * 1.2) + sp.phase;
      for (let i = 0; i <= SPIRAL_SEGMENTS; i++) {
        const u = i / SPIRAL_SEGMENTS;
        const ang = sp.phase + u * sp.turns * Math.PI * 2 + spin;
        const rad = sp.radius * (0.85 + 0.45 * Math.sin(u * 11 + spin * 1.3));
        const cx = origin.x + this.tmpA.x * len * u + this.tmpB.x * Math.cos(ang) * rad + this.tmpC.x * Math.sin(ang) * rad;
        const cy = origin.y + this.tmpA.y * len * u + this.tmpB.y * Math.cos(ang) * rad + this.tmpC.y * Math.sin(ang) * rad;
        const cz = origin.z + this.tmpA.z * len * u + this.tmpB.z * Math.cos(ang) * rad + this.tmpC.z * Math.sin(ang) * rad;
        // Ribbon width in the radial plane.
        this.tmpSide
          .copy(this.tmpB)
          .multiplyScalar(Math.cos(ang + Math.PI / 2))
          .addScaledVector(this.tmpC, Math.sin(ang + Math.PI / 2))
          .normalize()
          .multiplyScalar(sp.halfWidth * (1.15 - u * 0.25));
        writeRibbonSegment(sp.pos, i, cx, cy, cz, this.tmpSide.x, this.tmpSide.y, this.tmpSide.z);
      }
      (sp.mesh.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    // Orbiting sparks traveling hand → rift.
    for (let i = 0; i < SPARK_COUNT; i++) {
      const seed = this.sparkSeeds;
      const speed = seed[i * 4 + 2];
      const u = (seed[i * 4] + state.timeSec * speed * 0.28) % 1;
      const ang = seed[i * 4 + 1] + state.timeSec * 5.2;
      const rad = seed[i * 4 + 3] * (0.9 + 0.5 * Math.sin(ang * 2));
      const o = i * 3;
      this.sparkPos[o] =
        origin.x + this.tmpA.x * len * u + this.tmpB.x * Math.cos(ang) * rad + this.tmpC.x * Math.sin(ang) * rad;
      this.sparkPos[o + 1] =
        origin.y + this.tmpA.y * len * u + this.tmpB.y * Math.cos(ang) * rad + this.tmpC.y * Math.sin(ang) * rad;
      this.sparkPos[o + 2] =
        origin.z + this.tmpA.z * len * u + this.tmpB.z * Math.cos(ang) * rad + this.tmpC.z * Math.sin(ang) * rad;
      // Sparks mostly match the current beat color, with a few accent pads.
      const c = i % 5 === 0 ? this.padColors[i % 4] : beamCol;
      this.sparkCol[o] = c.r;
      this.sparkCol[o + 1] = c.g;
      this.sparkCol[o + 2] = c.b;
    }
    (this.sparks.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    (this.sparks.geometry.getAttribute('color') as Float32BufferAttribute).needsUpdate = true;

    // Palm emitter tangle.
    this.palmCore.position.copy(origin);
    this.palmHalo.position.copy(origin);
    const pulse = 0.16 + 0.05 * (0.5 + 0.5 * Math.sin(state.timeSec * 10));
    this.palmCore.scale.setScalar(pulse);
    this.palmHalo.scale.setScalar(pulse * 1.85);
    for (let i = 0; i < this.palmWisps.length; i++) {
      const w = this.palmWisps[i];
      w.mat.color.copy(this.padColors[i % 4]);
      const spin = state.timeSec * (8 + i * 1.4) + w.phase;
      for (let k = 0; k <= PALM_WISP_SEGMENTS; k++) {
        const u = k / PALM_WISP_SEGMENTS;
        const ang = w.phase + u * Math.PI * 3.4 + spin;
        const rad = 0.035 + u * 0.11;
        const along = u * 0.14;
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
          .multiplyScalar(Math.cos(ang + 1.2))
          .addScaledVector(this.tmpC, Math.sin(ang + 1.2))
          .normalize()
          .multiplyScalar(w.halfWidth * (1.1 - u * 0.5));
        writeRibbonSegment(w.pos, k, cx, cy, cz, this.tmpSide.x, this.tmpSide.y, this.tmpSide.z);
      }
      (w.mesh.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    }

    this.impact.position.copy(end);
    const hit = Math.max(0, Math.min(1, state.hitStrength));
    this.impactMat.opacity = hit * (0.65 + 0.35 * Math.sin(state.timeSec * 18));
    this.impact.scale.setScalar(0.18 + hit * 0.38);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
