/**
 * Shared neon note / glow-dot textures for the Rift Lab.
 * Visual-only: brighter four-color musical notes with a soft outer bloom.
 */
import {
  CanvasTexture,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Texture,
} from '@iwsdk/core';
import { PAD_COLORS, type PadColorName } from './rift-energy.js';

const noteGlyphCache = new Map<string, Texture>();
const noteMatCache = new Map<string, MeshBasicMaterial>();
let glowDotCache: Texture | null = null;

/** Soft round additive spark: hot core + falloff halo. */
export function glowDotTexture(): Texture {
  if (glowDotCache == null) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.16, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    glowDotCache = new CanvasTexture(canvas);
  }
  return glowDotCache;
}

/**
 * Neon eighth-note glyph: white-hot core, saturated rim, colored bloom.
 * Brighter than the pad hex so notes read like the concept art in MR.
 */
export function noteGlyphTexture(color: PadColorName): Texture {
  let tex = noteGlyphCache.get(color);
  if (tex == null) {
    const hex = PAD_COLORS[color];
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.font = 'bold 92px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Soft outer bloom
      ctx.shadowColor = hex;
      ctx.shadowBlur = 28;
      ctx.fillStyle = hex;
      ctx.fillText('\u266A', 64, 72);
      // Mid glow pass
      ctx.shadowBlur = 14;
      ctx.strokeStyle = hex;
      ctx.lineWidth = 6;
      ctx.strokeText('\u266A', 64, 72);
      // Hot core
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('\u266A', 64, 72);
      // Colored inner tint so the silhouette stays pad-colored
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = hex;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, 128, 128);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    noteGlyphCache.set(color, tex);
  }
  return tex;
}

/** Shared billboard material for orbit / trail notes. */
export function noteGlyphMaterial(color: PadColorName): MeshBasicMaterial {
  let mat = noteMatCache.get(color);
  if (mat == null) {
    // Normal blending: additive washed notes white on the bright hub room
    // (same lesson as the Nov 14 14:38 live check). Neon comes from the glyph.
    mat = new MeshBasicMaterial({
      map: noteGlyphTexture(color),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 1,
    });
    noteMatCache.set(color, mat);
  }
  return mat;
}

/** Lift pad hex toward neon: more sat, slightly brighter. */
export function neonPadHex(color: PadColorName): string {
  // Hand-tuned brighter cousins of the pad palette for filaments / beam.
  switch (color) {
    case 'green':
      return '#5dff9a';
    case 'red':
      return '#ff6b5c';
    case 'blue':
      return '#5cb8ff';
    case 'yellow':
      return '#ffe14a';
  }
}
