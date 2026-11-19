/**
 * Rift portal particle burst (Lab VFX only).
 *
 * Replaces the blurry glow-dot Points cloud, flat note Sprites, and dark rock
 * chips with thick neon notes, fine sharp sparks, and small luminous shards.
 * Idle sprays into room space; sealing reverses into the hole. No beam on idle.
 *
 * Lightweight single-pass shaders only (core + rim). No bloom stack.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShaderMaterial,
  Vector3,
  type Texture,
} from '@iwsdk/core';
import {
  PAD_COLORS,
  PAD_COLOR_NAMES,
  type PadColorName,
} from './rift-energy.js';
import { noteGlyphTexture } from './rift-note-visuals.js';
import type { GeometryParticlePool } from './rift-geometry-particles.js';
import { portalLayerOrders } from './rift-portal-layering.js';

/** Adjustable density / size / depth / glow for the portal cloud. */
export const PORTAL_BURST_TUNING = {
  noteCount: 16,
  sparkCount: 40,
  fragmentCount: 12,
  /** World-meter note height; readable in the pale Lab room. */
  noteSizeMin: 0.07,
  noteSizeMax: 0.14,
  noteThickness: 0.018,
  sparkSizeMin: 0.01,
  sparkSizeMax: 0.022,
  fragmentSizeMin: 0.018,
  fragmentSizeMax: 0.036,
  /** Local +Z depth into the room (meters). */
  depthMin: 0.08,
  depthMax: 0.62,
  /** Radial spread in the portal plane. */
  radiusMin: 0.14,
  radiusMax: 0.52,
  glow: 0.85,
  rim: 1.0,
  /** Spin rate (rad/s) for notes / shards. */
  spin: 0.4,
} as const;

const NOTE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vColor;

uniform vec3 uPadColor;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vColor = uPadColor;
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const NOTE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vColor;

uniform sampler2D uMap;
uniform float uOpacity;
uniform float uGlow;
uniform float uRim;
uniform float uUseMap;

void main() {
  vec3 base = vColor * 1.15;
  float alpha = 0.95;
  if (uUseMap > 0.5) {
    vec4 tex = texture2D(uMap, vUv);
    base = mix(vColor, tex.rgb * vColor * 1.35, 0.85);
    // Keep a solid extruded body even where the glyph is thin.
    alpha = max(tex.a, 0.55);
  }
  float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.2);
  vec3 col = base + fresnel * uRim * vec3(1.15);
  col += uGlow * 0.3 * vColor;
  // Hot shiny edge / face highlight.
  col = mix(col, vec3(1.0), fresnel * 0.45 + pow(ndv, 5.0) * 0.2);
  float a = alpha * uOpacity;
  if (a < 0.04) discard;
  gl_FragColor = vec4(col, a);
}
`;

const SPARK_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;

void main() {
  vUv = uv;
  // Three already injects the instancing color attribute when that define is
  // set — redeclaring it here fails shader compile.
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  #ifdef USE_INSTANCING
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SPARK_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;

uniform float uOpacity;
uniform float uStretch;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= mix(1.0, 1.0 / max(uStretch, 0.35), step(0.01, uStretch));
  float d = length(p);
  // Hard spark: tiny hot core, sharp cut — not a soft glow disk.
  float core = 1.0 - smoothstep(0.0, 0.22, d);
  float body = 1.0 - smoothstep(0.12, 0.52, d);
  float a = max(core, body * 0.45) * uOpacity;
  if (a < 0.06) discard;
  vec3 col = mix(vColor, vec3(1.0), core);
  gl_FragColor = vec4(col, a);
}
`;

const SHARD_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vColor;

void main() {
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
    vec4 worldPos = modelMatrix * im * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix * im) * normal);
  #else
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
  #endif
  // Three already injects the instancing color attribute when that define is
  // set — redeclaring it here fails shader compile.
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const SHARD_FRAG = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vColor;

uniform float uOpacity;
uniform float uRim;

void main() {
  float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.0);
  vec3 col = vColor * 0.9 + fresnel * uRim * vec3(1.0);
  col = mix(col, vec3(1.0), fresnel * 0.35);
  float a = (0.75 + fresnel * 0.25) * uOpacity;
  if (a < 0.05) discard;
  gl_FragColor = vec4(col, a);
}
`;

export type PortalBurstSeed = {
  life: number;
  ang: number;
  speed: number;
  radius: number;
  depth: number;
  size: number;
  spin: number;
  tumbleX: number;
  tumbleY: number;
  tumbleZ: number;
  colorIndex: number;
};

export type PortalBurst = {
  root: Group;
  notes: Mesh[];
  noteSeeds: PortalBurstSeed[];
  sparks: InstancedMesh;
  sparkSeeds: PortalBurstSeed[];
  fragments: InstancedMesh;
  fragmentSeeds: PortalBurstSeed[];
  noteMats: ShaderMaterial[];
  sparkMat: ShaderMaterial;
  fragmentMat: ShaderMaterial;
};

type GeoSparkDraw = {
  mesh: InstancedMesh;
  mat: ShaderMaterial;
  matrix: Matrix4;
  color: Color;
  quat: Quaternion;
  scale: Vector3;
  pos: Vector3;
};

let sharedNoteGeometry: ExtrudeGeometry | null = null;
let sharedSparkGeometry: PlaneGeometry | null = null;
let sharedShardGeometry: BufferGeometry | null = null;
let sharpSparkTexture: Texture | null = null;

function makeEighthNoteGeometry(thickness: number): ExtrudeGeometry {
  // Simple recognizable eighth-note silhouette (head + stem + flag).
  const shape = new Shape();
  shape.absellipse(0.0, 0.0, 0.32, 0.24, 0, Math.PI * 2, false, 0);
  const stem = new Shape();
  stem.moveTo(0.24, 0.0);
  stem.lineTo(0.32, 0.0);
  stem.lineTo(0.32, 0.95);
  stem.lineTo(0.24, 0.95);
  stem.closePath();
  const flag = new Shape();
  flag.moveTo(0.32, 0.95);
  flag.quadraticCurveTo(0.72, 0.78, 0.62, 0.42);
  flag.quadraticCurveTo(0.52, 0.62, 0.32, 0.72);
  flag.closePath();
  const geo = new ExtrudeGeometry([shape, stem, flag], {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.18,
    bevelSize: thickness * 0.12,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geo.center();
  // Normalize to ~1 unit tall so scale = world meters.
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = Math.max(bb.max.y - bb.min.y, 1e-4);
  geo.scale(1 / h, 1 / h, 1 / h);
  geo.computeVertexNormals();
  return geo;
}

function makeShardGeometry(): BufferGeometry {
  // Angular diamond / rhomboid shard (luminous fragment, not rock).
  const positions = new Float32Array([
    0, 0.55, 0.08,
    0.35, 0, 0.08,
    0, -0.55, 0.08,
    -0.35, 0, 0.08,
    0, 0, -0.1,
  ]);
  const indices = [
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4,
    0, 3, 2,
    0, 2, 1,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function noteGeometry(): ExtrudeGeometry {
  if (sharedNoteGeometry == null) {
    sharedNoteGeometry = makeEighthNoteGeometry(PORTAL_BURST_TUNING.noteThickness);
  }
  return sharedNoteGeometry;
}

function sparkGeometry(): PlaneGeometry {
  if (sharedSparkGeometry == null) {
    sharedSparkGeometry = new PlaneGeometry(1, 1);
  }
  return sharedSparkGeometry;
}

function shardGeometry(): BufferGeometry {
  if (sharedShardGeometry == null) {
    sharedShardGeometry = makeShardGeometry();
  }
  return sharedShardGeometry;
}

/** Tight hard spark map (optional; shader already hard-cuts). */
export function sharpSparkTextureMap(): Texture {
  if (sharpSparkTexture == null) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      ctx.clearRect(0, 0, 32, 32);
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 14);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.62, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    sharpSparkTexture = new CanvasTexture(canvas);
  }
  return sharpSparkTexture;
}

function makeNoteMaterial(color: PadColorName): ShaderMaterial {
  const hex = PAD_COLORS[color];
  return new ShaderMaterial({
    vertexShader: NOTE_VERT,
    fragmentShader: NOTE_FRAG,
    uniforms: {
      // Extruded note mesh already is the silhouette; glyph map UVs do not fit.
      uMap: { value: noteGlyphTexture(color) },
      uPadColor: { value: new Color(hex) },
      uOpacity: { value: 1 },
      uGlow: { value: PORTAL_BURST_TUNING.glow },
      uRim: { value: PORTAL_BURST_TUNING.rim },
      uUseMap: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: DoubleSide,
  });
}

function makeSparkMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    uniforms: {
      uOpacity: { value: 1 },
      uStretch: { value: 1.4 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

function makeShardMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SHARD_VERT,
    fragmentShader: SHARD_FRAG,
    uniforms: {
      uOpacity: { value: 1 },
      uRim: { value: PORTAL_BURST_TUNING.rim },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: DoubleSide,
  });
}

function seedParticle(
  i: number,
  riftId: number,
  kind: 'note' | 'spark' | 'fragment',
): PortalBurstSeed {
  const t = PORTAL_BURST_TUNING;
  const scramble = (riftId * 17 + i * 31 + (kind === 'note' ? 3 : kind === 'spark' ? 7 : 11)) % 1000;
  const n = scramble / 1000;
  const sizeMin =
    kind === 'note' ? t.noteSizeMin : kind === 'spark' ? t.sparkSizeMin : t.fragmentSizeMin;
  const sizeMax =
    kind === 'note' ? t.noteSizeMax : kind === 'spark' ? t.sparkSizeMax : t.fragmentSizeMax;
  return {
    life: n,
    ang: (scramble * 0.017 + i * 0.37) % (Math.PI * 2),
    speed: 0.45 + (scramble % 40) / 80,
    radius: t.radiusMin + ((scramble * 13) % 100) / 100 * (t.radiusMax - t.radiusMin),
    depth: t.depthMin + ((scramble * 7) % 100) / 100 * (t.depthMax - t.depthMin),
    size: sizeMin + ((scramble * 3) % 100) / 100 * (sizeMax - sizeMin),
    spin: ((scramble % 2 === 0 ? 1 : -1) * t.spin) * (0.6 + (scramble % 50) / 100),
    tumbleX: ((scramble * 2) % 100) / 100 * Math.PI * 2,
    tumbleY: ((scramble * 5) % 100) / 100 * Math.PI * 2,
    tumbleZ: ((scramble * 11) % 100) / 100 * Math.PI * 2,
    colorIndex: i % 4,
  };
}

const _mat = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scale = new Vector3();
const _color = new Color();
const _euler = new Euler();
const _axisY = new Vector3(0, 1, 0);

function sampleLife(
  seed: PortalBurstSeed,
  age: number,
  sealing: boolean,
): { life: number; f: number } {
  const life = (age * 0.42 * seed.speed + seed.life) % 1;
  // Sealing reverses flow back into the hole.
  const f = sealing ? 1 - life : life;
  return { life, f };
}

function placeFromSeed(
  seed: PortalBurstSeed,
  age: number,
  open: number,
  sealing: boolean,
  outPos: Vector3,
): { opacity: number; f: number } {
  const { f } = sampleLife(seed, age, sealing);
  const openK = 0.35 + 0.65 * open;
  const rr = sealing
    ? (1 - f) * seed.radius * openK
    : (0.08 + f * seed.radius) * openK;
  const ang = seed.ang + age * 0.55 * (sealing ? 1.4 : 1);
  const outZ = sealing
    ? (1 - f) * seed.depth
    : f * seed.depth;
  outPos.set(Math.cos(ang) * rr * 0.75, Math.sin(ang) * rr * 1.05, outZ);
  // Keep empty space: fade at birth/death; sealing dims as seal progresses is
  // applied by the caller via sealU.
  const opacity = Math.min(1, f * 5, (1 - f) * 4);
  return { opacity, f };
}

/**
 * Build a per-rift portal burst parented under the rift group. Uses the rift's
 * four edge colors for notes / shards / sparks.
 */
export function createPortalBurst(
  riftId: number,
  edgeColors: readonly PadColorName[],
): PortalBurst {
  const root = new Group();
  root.name = 'portal-burst';
  const t = PORTAL_BURST_TUNING;

  const noteMats: ShaderMaterial[] = [];
  const notes: Mesh[] = [];
  const noteSeeds: PortalBurstSeed[] = [];
  for (let i = 0; i < t.noteCount; i++) {
    const color = edgeColors[i % 4] ?? PAD_COLOR_NAMES[i % 4]!;
    const mat = makeNoteMaterial(color);
    noteMats.push(mat);
    const mesh = new Mesh(noteGeometry(), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    notes.push(mesh);
    noteSeeds.push(seedParticle(i, riftId, 'note'));
  }

  const sparkMat = makeSparkMaterial();
  const sparks = new InstancedMesh(sparkGeometry(), sparkMat, t.sparkCount);
  sparks.frustumCulled = false;
  sparks.renderOrder = 4;
  sparks.instanceMatrix.setUsage(DynamicDrawUsage);
  const sparkSeeds: PortalBurstSeed[] = [];
  for (let i = 0; i < t.sparkCount; i++) {
    sparkSeeds.push(seedParticle(i, riftId, 'spark'));
    _color.set(PAD_COLORS[edgeColors[i % 4] ?? PAD_COLOR_NAMES[i % 4]!]);
    sparks.setColorAt(i, _color);
    _mat.makeScale(0, 0, 0);
    sparks.setMatrixAt(i, _mat);
  }
  if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
  sparks.instanceMatrix.needsUpdate = true;
  root.add(sparks);

  const fragmentMat = makeShardMaterial();
  const fragments = new InstancedMesh(shardGeometry(), fragmentMat, t.fragmentCount);
  fragments.frustumCulled = false;
  fragments.renderOrder = 3;
  fragments.instanceMatrix.setUsage(DynamicDrawUsage);
  const fragmentSeeds: PortalBurstSeed[] = [];
  for (let i = 0; i < t.fragmentCount; i++) {
    fragmentSeeds.push(seedParticle(i, riftId, 'fragment'));
    _color.set(PAD_COLORS[edgeColors[i % 4] ?? PAD_COLOR_NAMES[i % 4]!]);
    fragments.setColorAt(i, _color);
    _mat.makeScale(0, 0, 0);
    fragments.setMatrixAt(i, _mat);
  }
  if (fragments.instanceColor) fragments.instanceColor.needsUpdate = true;
  fragments.instanceMatrix.needsUpdate = true;
  root.add(fragments);

  return {
    root,
    notes,
    noteSeeds,
    sparks,
    sparkSeeds,
    fragments,
    fragmentSeeds,
    noteMats,
    sparkMat,
    fragmentMat,
  };
}

/** Apply the mode-dependent portal/menu layer orders to one burst. */
export function applyPortalLayering(burst: PortalBurst, xr: boolean): void {
  const o = portalLayerOrders(xr);
  for (const note of burst.notes) note.renderOrder = o.note;
  burst.sparks.renderOrder = o.spark;
  burst.fragments.renderOrder = o.fragment;
}

export function updatePortalBurst(
  burst: PortalBurst,
  opts: {
    age: number;
    open: number;
    seal: number;
    sealing: boolean;
    /** World camera orientation so plane sparks stay camera-facing. */
    cameraQuat?: Quaternion;
  },
): void {
  const { age, open, seal, sealing, cameraQuat } = opts;
  const sealFade = 1 - 0.55 * seal;

  for (let i = 0; i < burst.notes.length; i++) {
    const seed = burst.noteSeeds[i]!;
    const mesh = burst.notes[i]!;
    const placed = placeFromSeed(seed, age, open, sealing, _pos);
    mesh.position.copy(_pos);
    const s = seed.size * (0.9 + 0.15 * Math.sin(age * 2.4 + seed.life * 9));
    mesh.scale.setScalar(s);
    // Mild tumble so notes read in stereo without going fully edge-on.
    mesh.rotation.set(
      seed.tumbleX * 0.35 + Math.sin(age * seed.spin + seed.life) * 0.45,
      seed.tumbleY * 0.25 + age * seed.spin * 0.55,
      seed.tumbleZ * 0.35 + Math.cos(age * 0.7 + seed.ang) * 0.35,
    );
    const mat = burst.noteMats[i]!;
    mat.uniforms.uOpacity!.value = Math.max(0.55, placed.opacity) * sealFade;
    mesh.visible = placed.opacity > 0.04;
  }

  for (let i = 0; i < burst.sparkSeeds.length; i++) {
    const seed = burst.sparkSeeds[i]!;
    const placed = placeFromSeed(seed, age, open, sealing, _pos);
    if (placed.opacity * sealFade < 0.05) {
      _mat.makeScale(0, 0, 0);
      burst.sparks.setMatrixAt(i, _mat);
      continue;
    }
    const s = seed.size * (0.7 + 0.5 * placed.f);
    _scale.set(s * 1.35, s * 0.7, s);
    if (cameraQuat != null) {
      // Billboard the thin spark plane so it never disappears edge-on.
      _quat.copy(cameraQuat);
    } else {
      _euler.set(
        seed.tumbleX + age * seed.spin * 2,
        seed.ang + age * 1.1,
        seed.tumbleZ,
      );
      _quat.setFromEuler(_euler);
    }
    _mat.compose(_pos, _quat, _scale);
    burst.sparks.setMatrixAt(i, _mat);
  }
  burst.sparks.instanceMatrix.needsUpdate = true;
  burst.sparkMat.uniforms.uOpacity!.value = sealFade;

  for (let i = 0; i < burst.fragmentSeeds.length; i++) {
    const seed = burst.fragmentSeeds[i]!;
    const placed = placeFromSeed(seed, age, open, sealing, _pos);
    if (placed.opacity * sealFade < 0.05) {
      _mat.makeScale(0, 0, 0);
      burst.fragments.setMatrixAt(i, _mat);
      continue;
    }
    const s = seed.size;
    _scale.set(s, s, s * 0.7);
    _euler.set(
      seed.tumbleX + age * seed.spin * 0.8,
      seed.tumbleY,
      age * seed.spin + seed.ang,
    );
    _quat.setFromEuler(_euler);
    _mat.compose(_pos, _quat, _scale);
    burst.fragments.setMatrixAt(i, _mat);
  }
  burst.fragments.instanceMatrix.needsUpdate = true;
  burst.fragmentMat.uniforms.uOpacity!.value = sealFade;
}

export function disposePortalBurst(burst: PortalBurst): void {
  burst.root.removeFromParent();
  for (const mat of burst.noteMats) mat.dispose();
  burst.sparkMat.dispose();
  burst.fragmentMat.dispose();
  burst.sparks.dispose();
  burst.fragments.dispose();
  // Shared geometries are kept for other rifts / geo pool.
}

/** Shared welding-spark drawer for the geometry-collision pool. */
export function createGeoSparkDraw(max: number): GeoSparkDraw {
  const mat = makeSparkMaterial();
  mat.uniforms.uStretch!.value = 1.1;
  mat.depthTest = true;
  const mesh = new InstancedMesh(sparkGeometry(), mat, max);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 4;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const matrix = new Matrix4();
  const color = new Color();
  matrix.makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) {
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.setRGB(1, 1, 1));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    mat,
    matrix,
    color,
    quat: new Quaternion(),
    scale: new Vector3(),
    pos: new Vector3(),
  };
}

/** Sync alive geometry-pool particles into the instanced spark mesh. */
export function syncGeoSparkDraw(
  draw: GeoSparkDraw,
  pool: GeometryParticlePool,
  cameraQuat?: Quaternion,
): void {
  const { mesh, matrix, color, quat, scale, pos } = draw;
  let shown = 0;
  for (let i = 0; i < pool.max; i++) {
    const life = pool.life[i]!;
    if (life <= 0) continue;
    const i3 = i * 3;
    pos.set(pool.pos[i3]!, pool.pos[i3 + 1]!, pool.pos[i3 + 2]!);
    color.setRGB(pool.col[i3]!, pool.col[i3 + 1]!, pool.col[i3 + 2]!);
    const life01 = life / Math.max(pool.maxLife[i]!, 1e-4);
    const s = 0.008 + 0.01 * life01;
    // Mild stretch along velocity for sharp welding feel.
    const vx = pool.vel[i3]!;
    const vy = pool.vel[i3 + 1]!;
    const vz = pool.vel[i3 + 2]!;
    const speed = Math.hypot(vx, vy, vz);
    scale.set(s * (1.2 + Math.min(1.8, speed * 0.35)), s * 0.65, s);
    if (cameraQuat != null) {
      // PlaneGeometry has no thickness — face the camera so sparks stay visible.
      quat.copy(cameraQuat);
    } else {
      quat.identity();
      if (speed > 0.05) {
        quat.setFromAxisAngle(_axisY, Math.atan2(vx, vz));
      }
    }
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(shown, matrix);
    mesh.setColorAt(shown, color);
    shown++;
  }
  for (let i = shown; i < pool.max; i++) {
    matrix.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.count = Math.max(shown, 1);
  mesh.visible = shown > 0;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  draw.mat.uniforms.uOpacity!.value = 1;
}
