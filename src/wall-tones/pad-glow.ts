/**
 * Glowing "holo glass" look for the Wall Tones pads.
 *
 * Everything is baked into a few small canvas textures and drawn with plain
 * unlit materials. No post-processing bloom (three.js EffectComposer does not
 * support WebXR, and extra full-screen passes are too costly on a headset) and
 * no custom per-pixel shader: one rounded translucent face plus one additive
 * glow quad per pad, so the cost is two cheap quads per pad on desktop,
 * phone and headset alike.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from '@iwsdk/core';

const FACE_Z = 0.0105;
const GLOW_Z = 0.0125;
/** Glow quad is this much larger than the face so the halo can spill out. */
const GLOW_SCALE = 1.3;
const FACE_CORNER = 0.22;
const WHITE = new Color(0xffffff);

/** Idle / hover / pressed halo strength. Pad color changes are done by pads.ts. */
const GLOW_BASE: Record<'idle' | 'hover' | 'pressed', number> = {
  idle: 0.72,
  hover: 0.95,
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
let cachedGlow: Texture | null = null;

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

/**
 * Soft nebula + sparkle face texture, light grey so the pad color tints it.
 * Tiles, so it can drift slowly (animatePadGlow).
 */
function faceTexture(): Texture {
  if (cachedFace == null) {
    const N = 256;
    const [c, ctx] = canvas(N);
    const rand = rng(7);
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(0, 0, N, N);
    for (let i = 0; i < 34; i += 1) {
      const x = rand() * N;
      const y = rand() * N;
      const r = 30 + rand() * 60;
      const light = rand() > 0.45;
      for (const ox of [-N, 0, N]) {
        for (const oy of [-N, 0, N]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, light ? 'rgba(255,255,255,0.40)' : 'rgba(120,120,120,0.30)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
    for (let i = 0; i < 46; i += 1) {
      const x = rand() * N;
      const y = rand() * N;
      const r = 0.6 + rand() * 1.2;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new CanvasTexture(c);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    cachedFace = t;
  }
  return cachedFace;
}

/** Bright thin rim plus a soft outer/inner halo, white so the pad color tints it. */
function glowTexture(): Texture {
  if (cachedGlow == null) {
    const N = 512;
    const [c, ctx] = canvas(N);
    const half = (0.5 / GLOW_SCALE) * N * 0.985;
    const radius = (FACE_CORNER / GLOW_SCALE) * N;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 40;
    ctx.lineWidth = 7;
    for (let i = 0; i < 2; i += 1) {
      roundRectPath(ctx, N / 2, N / 2, half, radius);
      ctx.stroke();
    }
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    roundRectPath(ctx, N / 2, N / 2, half, radius);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    roundRectPath(ctx, N / 2, N / 2, half, radius);
    ctx.stroke();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    cachedGlow = t;
  }
  return cachedGlow;
}

export type PadGlow = {
  glow: Mesh;
  glowMaterial: MeshBasicMaterial;
  faceMap: Texture;
  phase: number;
  base: number;
};

/**
 * Turn a pad's flat `face` mesh into a rounded translucent panel and attach the
 * glow quad to it (so the blink grow effect scales both together).
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

  const glowMaterial = new MeshBasicMaterial({
    map: glowTexture(),
    color: faceMaterial.color.clone(),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    opacity: GLOW_BASE.idle,
  });
  const glow = new Mesh(new PlaneGeometry(sizeM * GLOW_SCALE, sizeM * GLOW_SCALE), glowMaterial);
  glow.name = 'glow';
  glow.renderOrder = 12;
  // Child of the face, which sits at FACE_Z, so this is just in front of it.
  glow.position.z = GLOW_Z - FACE_Z;
  face.add(glow);
  return { glow, glowMaterial, faceMap, phase: padIndex * 1.7, base: GLOW_BASE.idle };
}

/** Make the halo follow the face color (hover, press, blink) and state strength. */
export function syncPadGlow(
  padGlow: PadGlow | undefined,
  faceMaterial: MeshBasicMaterial,
  state: 'idle' | 'hover' | 'pressed',
): void {
  if (padGlow == null) {
    return;
  }
  padGlow.glowMaterial.color.copy(faceMaterial.color).lerp(WHITE, 0.2);
  padGlow.base = GLOW_BASE[state];
  padGlow.glowMaterial.opacity = padGlow.base;
}

/** Slow breathing halo and drifting nebula. Cheap: no allocation, two uniforms. */
export function animatePadGlow(padGlow: PadGlow | undefined, timeS: number): void {
  if (padGlow == null) {
    return;
  }
  const breathe = 0.9 + 0.1 * Math.sin(timeS * 1.7 + padGlow.phase);
  padGlow.glowMaterial.opacity = padGlow.base * breathe;
  padGlow.faceMap.offset.x += 0.0004;
  padGlow.faceMap.offset.y += 0.00025;
}
