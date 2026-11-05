/**
 * Glowing "holo glass" look for the Wall Tones pads.
 *
 * Everything is baked into a few small canvas textures and drawn with plain
 * unlit materials. No post-processing bloom (three.js EffectComposer does not
 * support WebXR, and extra full-screen passes are too costly on a headset) and
 * no custom per-pixel shader: one rounded translucent face plus one additive
 * halo, a nebula overlay and two flame layers per pad (five cheap quads), all
 * animated by moving UV offsets and opacities only, so there is no per-frame
 * texture upload and no extra render pass on desktop, phone or headset.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from '@iwsdk/core';

const FACE_Z = 0.0105;
const OVERLAY_Z = 0.0112;
const GLOW_Z = 0.0125;
/** Glow quads are this much larger than the face so the halo can spill out. */
const GLOW_SCALE = 1.32;
const FACE_CORNER = 0.22;

/** Idle / hover / pressed halo strength. Pad color changes are done by pads.ts. */
const GLOW_BASE: Record<'idle' | 'hover' | 'pressed', number> = {
  idle: 0.8,
  hover: 1,
  pressed: 1,
};

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx == null) {
    throw new Error('2D canvas unavailable');
  }
  return [c, ctx];
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
  radius: number,
): void {
  const x = cx - half;
  const y = cy - half;
  const s = half * 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + s, y, x + s, y + s, radius);
  ctx.arcTo(x + s, y + s, x, y + s, radius);
  ctx.arcTo(x, y + s, x, y, radius);
  ctx.arcTo(x, y, x + s, y, radius);
  ctx.closePath();
}

/** Small deterministic PRNG so every pad texture is identical run to run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let cachedMask: Texture | null = null;
let cachedFace: Texture | null = null;
let cachedNebula: Texture | null = null;
let cachedGlow: Texture | null = null;
const cachedFlames: Texture[] = [];

/** Rounded-square cutout. alphaMap reads the green channel. */
function roundedMask(): Texture {
  if (cachedMask == null) {
    const [c, ctx] = canvas(512);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#fff';
    roundRectPath(ctx, 256, 256, 254, FACE_CORNER * 512);
    ctx.fill();
    cachedMask = new CanvasTexture(c);
  }
  return cachedMask;
}

function tiledBlobs(
  ctx: CanvasRenderingContext2D,
  N: number,
  rand: () => number,
  count: number,
  rMin: number,
  rMax: number,
  colorOf: (light: boolean) => string,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * N;
    const y = rand() * N;
    const r = rMin + rand() * (rMax - rMin);
    const light = rand() > 0.45;
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, colorOf(light));
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

function tiling(t: CanvasTexture): Texture {
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft nebula face texture, light grey so the pad color tints it. Tiles. */
function faceTexture(): Texture {
  if (cachedFace == null) {
    const N = 256;
    const [c, ctx] = canvas(N);
    const rand = rng(7);
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, N, N);
    tiledBlobs(ctx, N, rand, 34, 30, 90, (l) => (l ? 'rgba(255,255,255,0.45)' : 'rgba(90,90,90,0.38)'));
    cachedFace = tiling(new CanvasTexture(c));
  }
  return cachedFace;
}

/**
 * Brighter overlay: wispy light clouds and sparkle points on black. Drawn
 * additively on top of the face and scrolled the other way, so the two layers
 * slide across each other and the pattern visibly shifts and twinkles.
 */
function nebulaTexture(): Texture {
  if (cachedNebula == null) {
    const N = 256;
    const [c, ctx] = canvas(N);
    const rand = rng(23);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, N, N);
    tiledBlobs(ctx, N, rand, 26, 22, 70, () => 'rgba(255,255,255,0.32)');
    for (let i = 0; i < 70; i += 1) {
      const x = rand() * N;
      const y = rand() * N;
      const r = 0.8 + rand() * 1.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    cachedNebula = tiling(new CanvasTexture(c));
  }
  return cachedNebula;
}

/** Soft, wide halo plus a crisp thin rim. White on transparent; tinted by color. */
function glowTexture(): Texture {
  if (cachedGlow == null) {
    const N = 512;
    const [c, ctx] = canvas(N);
    const half = (0.5 / GLOW_SCALE) * N * 0.985;
    const radius = (FACE_CORNER / GLOW_SCALE) * N;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 46;
    ctx.lineWidth = 8;
    for (let i = 0; i < 2; i += 1) {
      roundRectPath(ctx, N / 2, N / 2, half, radius);
      ctx.stroke();
    }
    ctx.shadowBlur = 8;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    roundRectPath(ctx, N / 2, N / 2, half, radius);
    ctx.stroke();
    cachedGlow = new CanvasTexture(c);
    cachedGlow.colorSpace = SRGBColorSpace;
  }
  return cachedGlow;
}

/**
 * Flame layer: uneven licks of light hugging the rim, mostly outside it. Two
 * different bakes are cross-faded with different flicker rhythms, which reads
 * as fire running around the edge while only opacities change per frame.
 */
function flameTexture(variant: 0 | 1): Texture {
  const cached = cachedFlames[variant];
  if (cached != null) {
    return cached;
  }
  const N = 512;
  const [c, ctx] = canvas(N);
  const rand = rng(101 + variant * 57);
  const half = (0.5 / GLOW_SCALE) * N * 0.985;
  const radius = (FACE_CORNER / GLOW_SCALE) * N;
  const steps = 90;
  // Walk the rounded-square outline by sampling its perimeter parametrically.
  const straight = half - radius;
  for (let i = 0; i < steps * 4; i += 1) {
    const u = (i / (steps * 4)) * 4;
    const side = Math.floor(u);
    const f = u - side;
    // Position along the edge, nudged randomly; corners get rounded by clamping.
    const along = (f * 2 - 1) * half;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    if (side === 0) { x = along; y = -half; ny = -1; }
    else if (side === 1) { x = half; y = along; nx = 1; }
    else if (side === 2) { x = -along; y = half; ny = 1; }
    else { x = -half; y = -along; nx = -1; }
    const cx = Math.max(-straight, Math.min(straight, x));
    const cy = Math.max(-straight, Math.min(straight, y));
    if (Math.abs(x) > straight && Math.abs(y) > straight) {
      const dx = x - Math.sign(x) * straight;
      const dy = y - Math.sign(y) * straight;
      const len = Math.hypot(dx, dy) || 1;
      x = Math.sign(x) * straight + (dx / len) * radius;
      y = Math.sign(y) * straight + (dy / len) * radius;
      nx = dx / len;
      ny = dy / len;
    } else {
      void cx;
      void cy;
    }
    if (rand() > 0.55) {
      continue;
    }
    const reach = 4 + rand() * rand() * 30;
    const r = 6 + rand() * 18;
    const px = N / 2 + x + nx * reach;
    const py = N / 2 + y + ny * reach;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(255,255,255,${0.35 + rand() * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cachedFlames[variant] = t;
  return t;
}

export type PadGlow = {
  glow: Mesh;
  glowMaterial: MeshBasicMaterial;
  flames: Mesh[];
  flameMaterials: MeshBasicMaterial[];
  overlayMaterial: MeshBasicMaterial;
  faceMap: Texture;
  overlayMap: Texture;
  phase: number;
  base: number;
};

const HSL = { h: 0, s: 0, l: 0 };

/** Saturated, never-white glow color derived from the pad's current face color. */
function glowColor(target: Color, faceColor: Color): void {
  faceColor.getHSL(HSL);
  target.setHSL(HSL.h, 1, Math.min(0.6, Math.max(0.5, HSL.l)));
}

function glowMesh(size: number, tex: Texture, color: Color, opacity: number, order: number): [Mesh, MeshBasicMaterial] {
  const material = new MeshBasicMaterial({
    map: tex,
    color: color.clone(),
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
    opacity,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  mesh.renderOrder = order;
  mesh.position.z = GLOW_Z - FACE_Z;
  return [mesh, material];
}

/**
 * Turn a pad's flat `face` mesh into a rounded translucent panel and attach the
 * glow quads to it (so the blink grow effect scales them together).
 */
export function createPadGlow(
  face: Mesh,
  faceMaterial: MeshBasicMaterial,
  sizeM: number,
  padIndex: number,
): PadGlow {
  face.geometry.dispose();
  face.geometry = new PlaneGeometry(sizeM, sizeM);
  face.position.z = FACE_Z;

  const faceMap = faceTexture().clone();
  faceMap.needsUpdate = true;
  faceMap.offset.set(padIndex * 0.23, padIndex * 0.41);
  faceMaterial.map = faceMap;
  faceMaterial.alphaMap = roundedMask();
  faceMaterial.transparent = true;
  faceMaterial.opacity = 0.92;
  faceMaterial.depthWrite = false;
  faceMaterial.side = DoubleSide;
  faceMaterial.needsUpdate = true;

  const color = new Color();
  glowColor(color, faceMaterial.color);

  const overlayMap = nebulaTexture().clone();
  overlayMap.needsUpdate = true;
  overlayMap.repeat.set(1.7, 1.7);
  const overlayMaterial = new MeshBasicMaterial({
    map: overlayMap,
    alphaMap: roundedMask(),
    color: color.clone(),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    opacity: 0.4,
  });
  const overlay = new Mesh(new PlaneGeometry(sizeM, sizeM), overlayMaterial);
  overlay.renderOrder = 11;
  overlay.position.z = OVERLAY_Z - FACE_Z;
  face.add(overlay);

  const size = sizeM * GLOW_SCALE;
  const [glow, glowMaterial] = glowMesh(size, glowTexture(), color, GLOW_BASE.idle, 12);
  glow.name = 'glow';
  face.add(glow);
  const flames: Mesh[] = [];
  const flameMaterials: MeshBasicMaterial[] = [];
  for (const v of [0, 1] as const) {
    const [m, mat] = glowMesh(size, flameTexture(v), color, 0.7, 13 + v);
    m.position.z += 0.0004 * (v + 1);
    face.add(m);
    flames.push(m);
    flameMaterials.push(mat);
  }
  return {
    glow,
    glowMaterial,
    flames,
    flameMaterials,
    overlayMaterial,
    faceMap,
    overlayMap,
    phase: padIndex * 1.7,
    base: GLOW_BASE.idle,
  };
}

/** Make the glow follow the face hue (hover, press, blink) and state strength. */
export function syncPadGlow(
  padGlow: PadGlow | undefined,
  faceMaterial: MeshBasicMaterial,
  state: 'idle' | 'hover' | 'pressed',
): void {
  if (padGlow == null) {
    return;
  }
  glowColor(padGlow.glowMaterial.color, faceMaterial.color);
  for (const m of padGlow.flameMaterials) {
    m.color.copy(padGlow.glowMaterial.color);
  }
  padGlow.overlayMaterial.color.copy(padGlow.glowMaterial.color);
  padGlow.base = GLOW_BASE[state];
}

/** 0..1 irregular flicker from a few unrelated sines (no allocation, no random). */
function flicker(t: number): number {
  return 0.5 + 0.5 * ((Math.sin(t) + Math.sin(t * 2.31 + 1.3) + Math.sin(t * 3.77 + 2.9)) / 3);
}

/**
 * Per-frame motion. Only UV offsets, opacities and tiny scale changes move, so
 * there is no texture upload and no extra pass.
 */
export function animatePadGlow(padGlow: PadGlow | undefined, timeS: number): void {
  if (padGlow == null) {
    return;
  }
  const t = timeS;
  const p = padGlow.phase;
  // Face and overlay clouds slide in different directions at different speeds.
  padGlow.faceMap.offset.set(p * 0.1 + t * 0.045, p * 0.07 + t * 0.03);
  padGlow.overlayMap.offset.set(-p * 0.1 - t * 0.07, p * 0.05 + t * 0.05);
  padGlow.overlayMaterial.opacity = 0.3 + 0.25 * flicker(t * 1.6 + p);
  // Halo breathes; flame layers flicker out of step with each other.
  padGlow.glowMaterial.opacity = padGlow.base * (0.8 + 0.2 * flicker(t * 2.2 + p));
  for (let i = 0; i < padGlow.flames.length; i += 1) {
    const f = flicker(t * (5.3 + i * 2.1) + p * (i + 1));
    padGlow.flameMaterials[i]!.opacity = padGlow.base * (0.25 + 0.75 * f);
    const sc = 1 + 0.035 * flicker(t * (3.1 + i * 1.7) + p * 2 + i);
    padGlow.flames[i]!.scale.set(sc, sc, 1);
  }
}
