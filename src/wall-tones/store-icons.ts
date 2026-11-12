/**
 * Runtime-drawn store skill-tree tiles: same square tile + white line glyph +
 * level badge language as the achievement tiles (approved mockup style,
 * 2026-11-11), rendered to cached data URLs so no binary assets are committed.
 */

const cache = new Map<string, string>();
const ART_PX = 3; // canvas pixels per layout unit, for crisp phone/headset rendering

export type TileState = 'on' | 'sel' | 'off';

/** Tile colours per store category (achievement-tile palette family). */
const FILL: Record<string, [string, string]> = {
  listen: ['#38bdf8', '#1d6f96'],
  hint: ['#f2c14e', '#91732e'],
  autoplay: ['#4cc38a', '#2d7552'],
  replay: ['#4a90e2', '#2c5687'],
  saver: ['#e5534b', '#89312d'],
  secret: ['#a78bfa', '#645396'],
  multiplier: ['#f59a4a', '#a8622b'],
  speed: ['#38d9c8', '#1e7d74'],
  pads56: ['#9aa4b6', '#565e6e'],
  narrator: ['#818cf8', '#4c4f8f'],
};

/** Glyph outlines on the same 64x64 grid the achievement glyphs use. */
function glyphPath(ctx: CanvasRenderingContext2D, id: string): void {
  const P = (d: string): void => ctx.stroke(new Path2D(d));
  const F = (d: string): void => ctx.fill(new Path2D(d));
  if (id === 'listen') {
    // Headphones.
    P('M14 40v-6a18 18 0 0 1 36 0v6');
    P('M12 40h9v14h-9z');
    P('M43 40h9v14h-9z');
  } else if (id === 'hint') {
    // Lightbulb.
    ctx.beginPath();
    ctx.arc(32, 28, 14, 0, Math.PI * 2);
    ctx.stroke();
    P('M26 50h12');
    P('M28 56h8');
  } else if (id === 'autoplay') {
    // Play triangle.
    P('M24 14l26 18-26 18z');
  } else if (id === 'replay') {
    // Circular arrow.
    ctx.beginPath();
    ctx.arc(32, 34, 15, -Math.PI / 2 + 0.6, Math.PI * 1.5);
    ctx.stroke();
    F('M44 8l2 14-14-3z');
  } else if (id === 'saver') {
    // Shield with a check.
    P('M32 8l18 6v14c0 12-8 22-18 28-10-6-18-16-18-28V14z');
    P('M24 32l6 6 12-12');
  } else if (id === 'multiplier') {
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x2', 32, 34);
  } else if (id === 'speed') {
    // Fast-forward.
    P('M12 18l18 14-18 14z');
    P('M32 18l18 14-18 14z');
  } else if (id === 'pads56') {
    // Six pad squares (2 x 3).
    for (let i = 0; i < 6; i++) {
      const x = 10 + (i % 3) * 17;
      const y = 14 + Math.floor(i / 3) * 20;
      ctx.beginPath();
      ctx.roundRect(x, y, 13, 14, 3);
      ctx.stroke();
    }
  } else if (id === 'narrator') {
    // Person silhouette (the narrator joining our side).
    ctx.beginPath();
    ctx.arc(32, 24, 10, 0, Math.PI * 2);
    ctx.stroke();
    P('M16 54c2-11 8-15 16-15s14 4 16 15');
  } else {
    // secret / unknown: question mark.
    P('M22 24c0-12 20-12 20 0 0 7-10 8-10 16');
    ctx.beginPath();
    ctx.arc(32, 52, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * One transparent PNG per tile (drawn at runtime, no binary assets): glow,
 * gradient face, top gloss and highlight, glowing white glyph, and a
 * dark-centred badge baked in so layering cannot go wrong. The badge carries
 * the level, the held count, or a marker (e.g. a check or "?"). Layout box
 * is 92x92, same as the achievement tiles.
 */
export function storeTileSrc(id: string, state: TileState, badge: string): string {
  const key = `store-tile:${id}:${state}:${badge}`;
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
  if (locked) {
    // Dimmed face behind the greyed glyph: an opaque backing keeps the
    // tile layout size stable inside nested flex rows (a glyph-only
    // transparent PNG renders tiny there), and matches the greyed-locked
    // achievement tile language.
    const n = parseInt(pair[0].slice(1), 16);
    const dim = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.16)`;
    ctx.fillStyle = '#141a26';
    ctx.beginPath();
    ctx.roundRect(X, Y, W, W, R);
    ctx.fill();
    ctx.fillStyle = dim;
    ctx.beginPath();
    ctx.roundRect(X, Y, W, W, R);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,158,176,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(X, Y, W, W, R);
    ctx.stroke();
  }
  if (!locked) {
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
  // Badge: dark centre, category-colour ring, text on top. An empty badge
  // means no badge at all (one-time items show no fake level number).
  if (badge === '') {
    const url = c.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }
  const bx = X + W - 4, by = Y + W - 4, br = 11;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e1a';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = locked ? 'rgba(150,158,176,0.7)' : pair[0];
  ctx.stroke();
  ctx.fillStyle = locked ? '#9aa4b6' : '#e8edf3';
  ctx.font = badge.length > 1 ? 'bold 10px sans-serif' : 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, bx, by + 0.5);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/**
 * Small gate-chip glyphs for the store skill-tree connections (owner-approved
 * mockup variant A, 2026-11-12): a padlock while the gate is closed, a check
 * once it opens, and the downward arrow under the chip. Canvas-drawn like the
 * tiles - text glyphs render as boxes in some UIKit fonts.
 */
export type ChipGlyph = 'lock' | 'check' | 'arrow';

export function storeChipGlyphSrc(kind: ChipGlyph, color: string): string {
  const key = `store-chip:${kind}:${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const w = kind === 'arrow' ? 10 : 12;
  const h = kind === 'lock' ? 14 : kind === 'arrow' ? 6 : 12;
  const c = document.createElement('canvas');
  c.width = w * ART_PX;
  c.height = h * ART_PX;
  const ctx = c.getContext('2d');
  if (ctx == null) return '';
  ctx.scale(ART_PX, ART_PX);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'lock') {
    ctx.beginPath();
    ctx.roundRect(1, 6, 10, 7, 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.lineTo(3, 4.5);
    ctx.arc(6, 4.5, 3, Math.PI, 0);
    ctx.lineTo(9, 6);
    ctx.stroke();
  } else if (kind === 'check') {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(1.5, 6.5);
    ctx.lineTo(4.5, 10);
    ctx.lineTo(10.5, 2);
    ctx.stroke();
  } else {
    // Downward triangle.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
  }
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
