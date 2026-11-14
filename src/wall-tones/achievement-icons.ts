/**
 * Runtime-drawn achievement icons: 64x64 flat glyphs rendered to cached data
 * URLs. Avoids binary assets in the repo; glyphs follow the achievement id.
 */
const cache = new Map<string, string>();
const SIZE = 64;

function badge(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#24262b';
  ctx.beginPath();
  ctx.roundRect(2, 2, SIZE - 4, SIZE - 4, 12);
  ctx.fill();
  ctx.strokeStyle = '#4a4d55';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function flame(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.3, cx + s * 0.8, cy + s * 0.5, cx, cy + s);
  ctx.bezierCurveTo(cx - s * 0.8, cy + s * 0.5, cx - s * 0.9, cy - s * 0.3, cx, cy - s);
  ctx.fill();
  ctx.fillStyle = '#f5d90a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.1, cx + s * 0.4, cy + s * 0.6, cx, cy + s * 0.85);
  ctx.bezierCurveTo(cx - s * 0.4, cy + s * 0.6, cx - s * 0.5, cy + s * 0.1, cx, cy - s * 0.35);
  ctx.fill();
}

function bar(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.fillStyle = '#f5d90a';
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + h * 0.35, cy - h / 2);
  ctx.lineTo(cx + w / 2 - h * 0.35, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b8960a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function number(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  ctx.fillStyle = '#fafaf7';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, SIZE / 2, y);
}


/**
 * Category tiles: square, dark, neon border, white outline glyph. One glyph per
 * category, same stroke weight, so the meaning reads at a glance.
 */
const LINE_SIZE = 96;

/** Tile colours per category (from the approved mockup A; score is our own pick). */
const FILL: Record<string, [string, string]> = {
  streak: ['#4cc38a', '#2d7552'],
  bars: ['#f2c14e', '#91732e'],
  score: ['#f59a4a', '#a8622b'],
  store: ['#4a90e2', '#2c5687'],
  presses: ['#e5534b', '#89312d'],
  movement: ['#22d3ee', '#0e7490'],
  secret: ['#a78bfa', '#645396'],
};
export type TileState = 'on' | 'sel' | 'off';

/** Glyph outlines on the mockup's 64x64 grid, so icon art matches the mockup exactly. */
function glyphPath(ctx: CanvasRenderingContext2D, id: string): void {
  const P = (d: string): void => ctx.stroke(new Path2D(d));
  if (id === 'streak') {
    P('M32 6c4 10 15 15 15 29a15 15 0 0 1-30 0c0-6 3-10 6-13 0 5 3 7 5 7 0-8-1-15 4-23z');
    P('M32 40c3 3 5 5 5 8a5 5 0 0 1-10 0c0-3 2-5 5-8z');
  } else if (id === 'bars') {
    P('M8 44l9-18h30l9 18z');
    P('M24 35h16');
    P('M27 12v8M27 12l6 2');
  } else if (id === 'store') {
    P('M14 22h36l-3 32H17z');
    P('M24 22c0-8 4-13 8-13s8 5 8 13');
    P('M26 36l6 6 8-10');
  } else if (id === 'presses') {
    ctx.beginPath();
    ctx.roundRect(10, 10, 44, 44, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32, 32, 9, 0, Math.PI * 2);
    ctx.stroke();
    P('M32 32l10 12');
  } else if (id === 'score') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 25 : 11;
      const an = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = 32 + Math.cos(an) * r;
      const y = 35 + Math.sin(an) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (id === 'movement') {
    // Double-headed arrow over stride dots: walking between two points.
    // Fills the grid like the other glyphs (owner Nov 14: the first pass was
    // too small to read on the headset, "the Movement achievement has no
    // icon").
    P('M8 30h48M8 30l11-11M8 30l11 11M56 30l-11-11M56 30l-11 11');
    for (const dx of [-12, 0, 12]) {
      ctx.beginPath();
      ctx.arc(32 + dx, 50, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    P('M22 24c0-12 20-12 20 0 0 7-10 8-10 16');
    ctx.beginPath();
    ctx.arc(32, 52, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

const ART_PX = 3; // canvas pixels per layout unit, for crisp phone/headset rendering

/**
 * One transparent PNG per tile (drawn at runtime, no binary assets): glow,
 * gradient face, top gloss and highlight, glowing white glyph, and a dark-centred
 * level badge baked in so layering cannot go wrong. Layout box is 92x92.
 */
function tileArt(id: string, state: TileState, level: number): string {
  const key = `tile:${id}:${state}:${level}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const U = 92;
  const c = document.createElement('canvas');
  c.width = U * ART_PX;
  c.height = U * ART_PX;
  const ctx = c.getContext('2d');
  if (ctx == null) return '';
  ctx.scale(ART_PX, ART_PX);
  const pair = FILL[id] ?? ['#888888', '#555555'];
  const locked = state === 'off';
  const X = 8, Y = 6, W = 72, R = 18;
  if (!locked) {
    // Glow + gradient face (145deg like the mockup).
    ctx.save();
    ctx.shadowColor = pair[0] + 'aa';
    ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(X, Y, X + W, Y + W);
    g.addColorStop(0, pair[0]);
    g.addColorStop(1, pair[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(X, Y, W, W, R);
    ctx.fill();
    ctx.restore();
    // Top gloss (reflection) and a one-pixel inner highlight.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(X, Y, W, W, R);
    ctx.clip();
    const gl = ctx.createLinearGradient(0, Y, 0, Y + W * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,0.30)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(X, Y, W, W * 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.33)';
    ctx.fillRect(X + 4, Y, W - 8, 1.4);
    ctx.restore();
    if (state === 'sel') {
      ctx.strokeStyle = '#e8edf3';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(X - 3.5, Y - 3.5, W + 7, W + 7, R + 3.5);
      ctx.stroke();
    }
  }
  // Glyph on the 64-grid inside 14 units of padding.
  ctx.save();
  const pad = 11;
  const sc = (W - 2 * pad) / 64;
  ctx.translate(X + pad, Y + pad);
  ctx.scale(sc, sc);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (locked) {
    const n = parseInt(pair[0].slice(1), 16);
    const col = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.55)`;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
  } else {
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.65)';
    ctx.shadowBlur = 5;
  }
  glyphPath(ctx, id);
  ctx.restore();
  // Badge: dark centre, category-colour ring, number on top (mockup: #0a0e1a, 3px ring).
  const bx = X + W - 4, by = Y + W - 4, br = 11;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e1a';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = locked ? 'rgba(150,158,176,0.7)' : pair[0];
  ctx.stroke();
  ctx.fillStyle = locked ? '#9aa4b6' : '#e8edf3';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), bx, by + 0.5);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

import { ACHIEVEMENT_ICON_PNG } from './achievement-icon-art.js';

export function achievementTileSrc(id: string, state: TileState, level = 0): string {
  return tileArt(id, state, level);
}

export function achievementIconSrc(id: string): string {
  if (id in FILL) return tileArt(id, 'on', 0);
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const art = ACHIEVEMENT_ICON_PNG[id];
  if (art !== undefined) {
    cache.set(id, art);
    return art;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx == null) return '';
  badge(ctx);
  // Category icons (one per category, not per threshold).
  if (id === 'streak') {
    flame(ctx, SIZE / 2, SIZE / 2, 20);
  } else if (id === 'bars') {
    bar(ctx, SIZE / 2, 24, 34, 13);
    bar(ctx, SIZE / 2, 40, 26, 11);
  } else if (id === 'score') {
    ctx.fillStyle = '#f5d90a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 22 : 9;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = SIZE / 2 + Math.cos(a) * r;
      const y = SIZE / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (id === 'store') {
    ctx.fillStyle = '#f5d90a';
    ctx.beginPath();
    ctx.roundRect(14, 24, 36, 26, 6);
    ctx.fill();
    ctx.strokeStyle = '#f5d90a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(SIZE / 2, 24, 9, Math.PI, 0);
    ctx.stroke();
  } else if (id === 'presses') {
    const colors = ['#3ddc84', '#ff5a5a', '#4aa8ff', '#f5d90a'];
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(10 + (i % 2) * 24, 10 + Math.floor(i / 2) * 24, 20, 20, 5);
      ctx.fill();
    });
  } else if (id === 'secret') {
    ctx.fillStyle = '#8a8f99';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', SIZE / 2, SIZE / 2 + 2);
  } else if (id.startsWith('streak-')) {
    flame(ctx, SIZE / 2, 26, 16);
    number(ctx, id.slice('streak-'.length), 50);
  } else if (id.startsWith('bars-')) {
    bar(ctx, SIZE / 2, 24, 30, 14);
    number(ctx, id.slice('bars-'.length), 50);
  } else if (id === 'first-pattern') {
    const colors = ['#3ddc84', '#ff5a5a', '#4aa8ff', '#f5d90a'];
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(10 + (i % 2) * 24, 10 + Math.floor(i / 2) * 24, 20, 20, 5);
      ctx.fill();
    });
  } else if (id === 'first-purchase') {
    ctx.fillStyle = '#f5d90a';
    ctx.beginPath();
    ctx.arc(SIZE / 2, 26, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8960a';
    ctx.fillRect(SIZE / 2 - 6, 40, 12, 6);
    ctx.fillRect(SIZE / 2 - 4, 48, 8, 4);
  }
  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
      }
