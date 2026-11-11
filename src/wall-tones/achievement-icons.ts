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
const NEON: Record<string, string> = {
  streak: '#ff8a3d',
  bars: '#f5d90a',
  score: '#4aa8ff',
  store: '#3ddc84',
  presses: '#ff5a8a',
  secret: '#b48cff',
};

function lineGlyph(id: string): string {
  const hit = cache.get('line:' + id);
  if (hit !== undefined) return hit;
  const c = document.createElement('canvas');
  c.width = LINE_SIZE;
  c.height = LINE_SIZE;
  const ctx = c.getContext('2d');
  if (ctx == null) return '';
  const neon = NEON[id] ?? '#ffffff';
  ctx.fillStyle = '#15181d';
  ctx.beginPath();
  ctx.roundRect(3, 3, LINE_SIZE - 6, LINE_SIZE - 6, 14);
  ctx.fill();
  ctx.strokeStyle = neon;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const m = LINE_SIZE / 2;
  ctx.beginPath();
  if (id === 'streak') {
    ctx.moveTo(m, 18);
    ctx.bezierCurveTo(m + 26, 38, m + 24, 62, m, 78);
    ctx.bezierCurveTo(m - 24, 62, m - 26, 38, m, 18);
    ctx.moveTo(m, 46);
    ctx.bezierCurveTo(m + 10, 56, m + 9, 66, m, 72);
    ctx.bezierCurveTo(m - 9, 66, m - 10, 56, m, 46);
  } else if (id === 'bars') {
    ctx.moveTo(30, 40); ctx.lineTo(66, 40); ctx.lineTo(72, 54); ctx.lineTo(24, 54); ctx.closePath();
    ctx.moveTo(22, 58); ctx.lineTo(48, 58); ctx.lineTo(52, 72); ctx.lineTo(16, 72); ctx.closePath();
    ctx.moveTo(52, 58); ctx.lineTo(74, 58); ctx.lineTo(80, 72); ctx.lineTo(56, 72); ctx.closePath();
    ctx.moveTo(38, 26); ctx.lineTo(58, 26);
  } else if (id === 'score') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 32 : 14;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = m + Math.cos(a) * r;
      const y = m + 3 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (id === 'store') {
    ctx.roundRect(24, 40, 48, 38, 8);
    ctx.moveTo(34, 40); ctx.arc(m, 40, 14, Math.PI, 0);
    ctx.moveTo(m, 54); ctx.lineTo(m, 64);
  } else if (id === 'presses') {
    ctx.roundRect(20, 20, 24, 24, 6);
    ctx.roundRect(52, 20, 24, 24, 6);
    ctx.roundRect(20, 52, 24, 24, 6);
    ctx.roundRect(52, 52, 24, 24, 6);
  } else {
    ctx.arc(m, 38, 14, Math.PI * 1.05, Math.PI * 2.4);
    ctx.bezierCurveTo(m + 16, 54, m, 54, m, 62);
    ctx.moveTo(m, 74); ctx.lineTo(m, 75);
  }
  ctx.stroke();
  const url = c.toDataURL('image/png');
  cache.set('line:' + id, url);
  return url;
}

import { ACHIEVEMENT_ICON_PNG } from './achievement-icon-art.js';

export function achievementIconSrc(id: string): string {
  if (id in NEON) return lineGlyph(id);
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
