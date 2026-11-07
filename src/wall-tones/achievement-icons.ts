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

export function achievementIconSrc(id: string): string {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx == null) return '';
  badge(ctx);
  if (id.startsWith('streak-')) {
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
