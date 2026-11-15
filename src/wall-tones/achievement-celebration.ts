/**
 * Achievement unlock celebration (item 54).
 *
 * Owner brief (2026-11-11 23:13, verbatim): "there needs to be more flare
 * for the acvhiement unlock. in desktop and mobile it should be a big pop up
 * thing on the middle of the screen with juicy polished flashy animation with
 * glow and fades and shares and what not. and the it needs to animate into
 * the achivement button. in MR it should be similar but as a billoarded
 * things in frotn of you. perhaps in both it woudn't jsut be a flat
 * "Achivement unlocked" but somethign more 3D."
 *
 * Look and timing implement the interactive prototype Oded approved
 * 2026-11-12 00:47 ("ok. let's hope the implementation would also look this
 * good. yeah?"): burst pop with flash, glow ring and twelve sparks, an
 * "ACHIEVEMENT UNLOCKED" letter cascade, the achievement name fading in, a
 * hold with pulsing gold glow and a shimmer sweep, then the whole thing
 * shrinks and arcs into the Achievements button, which pulses gold.
 * Each achievement shows its own category logo (his 00:48 ask). The Streak
 * flame is the one approved 3D-logo pilot: a real relief mesh turning
 * slowly during the hold (his 00:52 "maybe the logo can also roratet");
 * the other categories keep their 2D art until that treatment is judged.
 *
 * Flat mode (desktop/phone) plays a DOM overlay with transform-only CSS
 * animation; immersive mode plays the same beats on a head-facing
 * billboarded canvas panel plus the true 3D flame mesh, then flies into the
 * panel's Achievements button in world space. No spoken words: voice
 * stays milestone-only (user rule); the November 14 revision adds
 * synthesized sound effects on the show beats (his ask: "There should
 * also be some audio for the achievement, some sound effects
 * associated with it."). Multiple simultaneous unlocks queue and play
 * one at a time.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Scene,
} from '@iwsdk/core';
import type { AchievementDef } from './economy.js';
import { playAchievementCelebrationSfx } from './audio.js';
import { ACHIEVEMENT_ICON_PNG } from './achievement-icon-art.js';

/* Timing (seconds), shared by the flat DOM choreography and the MR canvas
 * drawing so both stay in lockstep with the approved prototype. */
const T = {
  POP: 0.65,
  FLASH_DELAY: 0.05,
  FLASH: 0.55,
  RING_DELAY: 0.1,
  RING: 0.8,
  SPARKS_DELAY: 0.5,
  SPARKS: 0.75,
  LETTERS_DELAY: 0.45,
  LETTER_STAGGER: 0.035,
  NAME_DELAY: 1.25,
  FLY_START: 2.2,
  FLY: 0.85,
  TARGET_PULSE: 2.55,
  TOTAL: 3.1,
} as const;

const TITLE_WORD = 'ACHIEVEMENT UNLOCKED';

/** Spark burst layout from the approved prototype (angle deg, travel px). */
const SPARKS: ReadonlyArray<{ angle: number; dist: number }> = [
  { angle: -90, dist: 120 }, { angle: -45, dist: 105 }, { angle: 0, dist: 118 },
  { angle: 45, dist: 100 }, { angle: 90, dist: 112 }, { angle: 135, dist: 96 },
  { angle: 180, dist: 122 }, { angle: 225, dist: 92 }, { angle: 270, dist: 108 },
  { angle: 315, dist: 116 }, { angle: -20, dist: 88 }, { angle: 160, dist: 90 },
];

/* The flame silhouette paths, on the same 64x64 grid the game's icon glyphs
 * use (src/wall-tones/achievement-icons.ts). The relief mesh built from
 * them is the approved 3D pilot, so the flat and MR 3D flames share it. */
const FLAME_OUTER_PATH =
  'M32 6c4 10 15 15 15 29a15 15 0 0 1-30 0c0-6 3-10 6-13 0 5 3 7 5 7 0-8-1-15 4-23z';
const FLAME_INNER_PATH =
  'M32 40c3 3 5 5 5 8a5 5 0 0 1-10 0c0-3 2-5 5-8z';
/** Game colours: outer flame #f5a623, inner flame #f5d90a. */
const FLAME_ORANGE: [number, number, number] = [0.96, 0.65, 0.14];
const FLAME_YELLOW: [number, number, number] = [0.96, 0.85, 0.04];

/* ------------------------------------------------------------------ */
/* Flame relief mesh data (shared by the raw-WebGL flat renderer and   */
/* the three.js MR mesh). Ported from the approved prototype.          */
/* ------------------------------------------------------------------ */

interface FlameMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** 1 inside the silhouette, 0 outside (alpha mask per vertex). */
  inside: Float32Array;
  indices: Uint32Array | Uint16Array;
  use32: boolean;
}

let flameMeshCache: FlameMeshData | null = null;

function maskFrom(path: string, m: number): Uint8ClampedArray {
  const hi = document.createElement('canvas');
  hi.width = hi.height = m * 2;
  const xh = hi.getContext('2d')!;
  xh.scale((m * 2) / 64, (m * 2) / 64);
  xh.fillStyle = '#fff';
  xh.fill(new Path2D(path));
  const c = document.createElement('canvas');
  c.width = c.height = m;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(hi, 0, 0, m, m);
  return x.getImageData(0, 0, m, m).data;
}

/** Chamfer distance to the silhouette edge: drives the relief dome. */
function distField(mask: Uint8ClampedArray, m: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(m * m);
  for (let i = 0; i < m * m; i++) d[i] = mask[i * 4 + 3]! > 127 ? INF : 0;
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const i = y * m + x;
      if (x > 0) d[i] = Math.min(d[i]!, d[i - 1]! + 1);
      if (y > 0) d[i] = Math.min(d[i]!, d[i - m]! + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i]!, d[i - m - 1]! + 1.414);
      if (x < m - 1 && y > 0) d[i] = Math.min(d[i]!, d[i - m + 1]! + 1.414);
    }
  }
  for (let y = m - 1; y >= 0; y--) {
    for (let x = m - 1; x >= 0; x--) {
      const i = y * m + x;
      if (x < m - 1) d[i] = Math.min(d[i]!, d[i + 1]! + 1);
      if (y < m - 1) d[i] = Math.min(d[i]!, d[i + m]! + 1);
      if (x < m - 1 && y < m - 1) d[i] = Math.min(d[i]!, d[i + m + 1]! + 1.414);
      if (x > 0 && y < m - 1) d[i] = Math.min(d[i]!, d[i + m - 1]! + 1.414);
    }
  }
  return d;
}

function buildFlameMeshData(): FlameMeshData | null {
  if (flameMeshCache != null) return flameMeshCache;
  if (typeof document === 'undefined') return null;
  const M = 192;
  const outer = maskFrom(FLAME_OUTER_PATH, M);
  const inner = maskFrom(FLAME_INNER_PATH, M);
  const dist = distField(outer, M);
  const R = 17; // rounding radius in px
  const DEPTH = 0.22; // relief height in world units
  const S = 2 / (M - 1); // world units per px

  const insideAt = (i: number) => outer[i * 4 + 3]! > 127;
  const hmap = new Float32Array(M * M);
  for (let i = 0; i < M * M; i++) {
    if (!insideAt(i)) continue;
    const t = Math.min(dist[i]! / R, 1);
    hmap[i] = DEPTH * Math.sqrt(Math.max(0, 2 * t - t * t));
  }
  // Two 3x3 box-blur passes smooth the dome so the bevel does not band.
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(hmap);
    for (let y = 1; y < M - 1; y++) {
      for (let x = 1; x < M - 1; x++) {
        const i = y * M + x;
        if (!insideAt(i)) continue;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[i + dy * M + dx]!;
        hmap[i] = sum / 9;
      }
    }
  }
  const height = (i: number) => hmap[i]!;

  const vertsPerSide = M * M;
  const pos = new Float32Array(vertsPerSide * 2 * 3);
  const nrm = new Float32Array(vertsPerSide * 2 * 3);
  const col = new Float32Array(vertsPerSide * 2 * 3);
  const ins = new Float32Array(vertsPerSide * 2);
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const i = y * M + x;
      const wx = (x / (M - 1) - 0.5) * 2;
      const wy = (0.5 - y / (M - 1)) * 2;
      const h = height(i);
      const hx = (height(Math.min(i + 1, y * M + M - 1)) - height(Math.max(i - 1, y * M))) / (2 * S);
      const hy = (height(Math.min(i + M, (M - 1) * M + x)) - height(Math.max(i - M, x))) / (2 * S);
      const inv = 1 / Math.hypot(hx, hy, 1);
      const isIn = insideAt(i) ? 1 : 0;
      const c = inner[i * 4 + 3]! > 127 ? FLAME_YELLOW : FLAME_ORANGE;
      pos.set([wx, wy, h], i * 3);
      nrm.set([-hx * inv, hy * inv, inv], i * 3);
      col.set(c, i * 3);
      ins[i] = isIn;
      const b = vertsPerSide + i;
      pos.set([wx, wy, -h], b * 3);
      nrm.set([-hx * inv, hy * inv, -inv], b * 3);
      col.set(c, b * 3);
      ins[b] = isIn;
    }
  }
  const idx: number[] = [];
  for (let y = 0; y < M - 1; y++) {
    for (let x = 0; x < M - 1; x++) {
      const a = y * M + x, bq = a + 1, cq = a + M, dq = a + M + 1;
      if (insideAt(a) || insideAt(bq) || insideAt(cq) || insideAt(dq)) {
        idx.push(a, cq, bq, bq, cq, dq);
        const o = vertsPerSide;
        idx.push(o + a, o + bq, o + cq, o + bq, o + dq, o + cq);
      }
    }
  }
  const use32 = M * M * 2 > 65535;
  flameMeshCache = {
    positions: pos,
    normals: nrm,
    colors: col,
    inside: ins,
    indices: use32 ? new Uint32Array(idx) : new Uint16Array(idx),
    use32,
  };
  return flameMeshCache;
}

/* Shared flame shading (prototype lambert + warm rim), GLSL for both the
 * flat raw-WebGL canvas and the three.js ShaderMaterial in MR. */
const FLAME_FRAG = `
precision mediump float;
varying vec3 vN; varying vec3 vC; varying float vIn;
uniform float uOpacity;
void main() {
  if (vIn < 0.5) discard;
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.45, 0.75, 0.55));
  float d = max(dot(n, L), 0.0);
  vec3 col = vC * (0.52 + 0.62 * d) + vC * 0.16;
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.22;
  col += vec3(1.0, 0.85, 0.4) * rim;
  gl_FragColor = vec4(col, uOpacity);
}`;

/* ------------------------------------------------------------------ */
/* Flat mode: small raw-WebGL canvas rendering the rotating flame      */
/* inside the DOM badge (the approved prototype's Flame3D, un-Reacted).*/
/* ------------------------------------------------------------------ */

class FlatFlameCanvas {
  private raf = 0;
  private gl: WebGLRenderingContext | null = null;
  readonly ok = false;

  constructor(canvas: HTMLCanvasElement, size: number) {
    const data = buildFlameMeshData();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const gl = data == null
      ? null
      : canvas.getContext('webgl', { alpha: true, antialias: true });
    if (gl == null || data == null) return;
    this.gl = gl;

    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const VERT = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute float aIn;
uniform mat4 uMvp; uniform mat3 uRot;
varying vec3 vN; varying vec3 vC; varying float vIn;
void main() {
  vN = normalize(uRot * aNrm); vC = aCol; vIn = aIn;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FLAME_FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const bind = (name: string, buf: Float32Array, size2: number) => {
      const loc = gl.getAttribLocation(prog, name);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size2, gl.FLOAT, false, 0, 0);
    };
    bind('aPos', data.positions, 3);
    bind('aNrm', data.normals, 3);
    bind('aCol', data.colors, 3);
    bind('aIn', data.inside, 1);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    const use32 = data.use32 && !!gl.getExtension('OES_element_index_uint');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    const uMvp = gl.getUniformLocation(prog, 'uMvp');
    const uRot = gl.getUniformLocation(prog, 'uRot');
    const uOpacity = gl.getUniformLocation(prog, 'uOpacity');
    gl.uniform1f(uOpacity, 1);

    const perspective = (fov: number, aspect: number, near: number, far: number): number[] => {
      const f = 1 / Math.tan(fov / 2);
      const nf = 1 / (near - far);
      return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
      ];
    };
    const mul = (a: number[], b: number[]) => {
      const o = new Array<number>(16).fill(0);
      for (let r = 0; r < 4; r++) for (let cq = 0; cq < 4; cq++)
        for (let k = 0; k < 4; k++) o[cq * 4 + r] += a[k * 4 + r]! * b[cq * 4 + k]!;
      return o;
    };
    const start = performance.now();
    const speed = 1.1; // badge turn rate from the approved prototype
    const frame = (now: number) => {
      if (this.gl == null) return;
      const t = ((now - start) / 1000) * speed;
      const tilt = 0.16;
      const cy = Math.cos(t), sy = Math.sin(t), cx = Math.cos(tilt), sx = Math.sin(tilt);
      const m = [
        cy, sx * sy, -cx * sy, 0,
        0, cx, sx, 0,
        sy, -sx * cy, cx * cy, 0,
        0, 0, 0, 1,
      ];
      const p = perspective(0.62, 1, 0.1, 10);
      const v = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.4, 1];
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uMvp, false, new Float32Array(mul(p, mul(v, m))));
      gl.uniformMatrix3fv(uRot, false, new Float32Array([
        m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!,
      ]));
      gl.drawElements(gl.TRIANGLES, data.indices.length, use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    (this as { ok: boolean }).ok = true;
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}

/* ------------------------------------------------------------------ */
/* Flat mode DOM overlay                                               */
/* ------------------------------------------------------------------ */

const FLAT_STYLE_ID = 'wt-achv-celebration-style';

function ensureFlatStyle(): void {
  if (document.getElementById(FLAT_STYLE_ID) != null) return;
  const style = document.createElement('style');
  style.id = FLAT_STYLE_ID;
  style.textContent = `
.wt-achv-celebration {
  position: fixed; inset: 0; z-index: 100002; pointer-events: none;
  display: grid; place-items: center; perspective: 900px;
}
.wt-achv-fly { animation: wt-achv-fly ${T.FLY}s cubic-bezier(.5, -.05, .7, .4) ${T.FLY_START}s both; }
@keyframes wt-achv-fly {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(.1); opacity: 0; }
}
.wt-achv-pop {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px;
  transform-style: preserve-3d;
  animation:
    wt-achv-pop-in ${T.POP}s cubic-bezier(.2, 1.5, .35, 1) both,
    wt-achv-float 2.4s ease-in-out .7s 2 alternate;
}
@keyframes wt-achv-pop-in {
  0% { transform: scale(.2) rotateY(95deg); opacity: 0; }
  60% { transform: scale(1.12) rotateY(-8deg); opacity: 1; }
  100% { transform: scale(1) rotateY(0deg); opacity: 1; }
}
@keyframes wt-achv-float {
  0% { transform: translateY(0); }
  100% { transform: translateY(-7px); }
}
.wt-achv-flash {
  position: absolute; left: 50%; top: 50%; width: 560px; height: 560px;
  transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(255, 226, 130, .5) 0%, rgba(255, 226, 130, 0) 55%);
  animation: wt-achv-flash ${T.FLASH}s ease-out ${T.FLASH_DELAY}s both;
}
@keyframes wt-achv-flash {
  0% { transform: translate(-50%, -50%) scale(.2); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.15); opacity: 0; }
}
.wt-achv-ring {
  position: absolute; left: 50%; top: 38%; width: 120px; height: 120px;
  transform: translate(-50%, -50%); border-radius: 50%;
  border: 3px solid rgba(245, 198, 46, .8); pointer-events: none;
  animation: wt-achv-ring ${T.RING}s cubic-bezier(.1, .6, .3, 1) ${T.RING_DELAY}s both;
}
@keyframes wt-achv-ring {
  0% { transform: translate(-50%, -50%) scale(.3); opacity: .95; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
}
.wt-achv-sparks { position: absolute; left: 50%; top: 38%; pointer-events: none; }
.wt-achv-spark {
  position: absolute; width: 7px; height: 7px; border-radius: 2px;
  background: linear-gradient(135deg, #ffe282, #f5a62e);
  box-shadow: 0 0 8px rgba(245, 198, 46, .9);
  animation: wt-achv-spark ${T.SPARKS}s cubic-bezier(.1, .7, .3, 1) both;
}
@keyframes wt-achv-spark {
  0% { transform: rotate(var(--a)) translateX(0) scale(1); opacity: 1; }
  100% { transform: rotate(var(--a)) translateX(var(--d)) scale(.15); opacity: 0; }
}
.wt-achv-badge {
  position: relative; width: 108px; height: 108px; border-radius: 50%;
  display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(circle at 32% 28%, #ffe9a8 0%, #f5c62e 38%, #c8901a 78%, #8a630c 100%);
  border: 3px solid #ffe9a8;
  box-shadow:
    0 0 24px rgba(245, 198, 46, .75),
    0 0 64px rgba(245, 198, 46, .4),
    inset 0 -6px 14px rgba(90, 62, 6, .55),
    inset 0 4px 10px rgba(255, 246, 216, .6);
  animation: wt-achv-badge-glow 1.5s ease-in-out .6s both;
}
@keyframes wt-achv-badge-glow {
  0%, 100% { box-shadow: 0 0 24px rgba(245,198,46,.75), 0 0 64px rgba(245,198,46,.4), inset 0 -6px 14px rgba(90,62,6,.55), inset 0 4px 10px rgba(255,246,216,.6); }
  50% { box-shadow: 0 0 36px rgba(245,198,46,.95), 0 0 110px rgba(245,198,46,.6), inset 0 -6px 14px rgba(90,62,6,.55), inset 0 4px 10px rgba(255,246,216,.6); }
}
.wt-achv-badge-shimmer {
  position: absolute; inset: -40%;
  background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, .85) 50%, transparent 58%);
  animation: wt-achv-shimmer 1.1s ease-in-out .85s both;
}
@keyframes wt-achv-shimmer {
  0% { transform: translateX(-70%); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateX(70%); opacity: 0; }
}
.wt-achv-badge-disc {
  width: 78px; height: 78px; border-radius: 50%;
  display: grid; place-items: center;
  background: radial-gradient(circle at 40% 32%, #33363d 0%, #24262b 70%, #17181c 100%);
  box-shadow: inset 0 2px 6px rgba(255, 255, 255, .08), inset 0 -4px 10px rgba(0, 0, 0, .5);
}
.wt-achv-badge-disc canvas { filter: drop-shadow(0 0 10px rgba(245, 166, 35, .45)); }
.wt-achv-badge-disc img { width: 48px; height: 48px; border-radius: 10px; }
.wt-achv-title {
  font-size: 21px; font-weight: 700; letter-spacing: .16em; color: #ffe9a8;
  text-shadow: 0 0 14px rgba(245, 198, 46, .65), 0 2px 6px rgba(0, 0, 0, .6);
  text-align: center; font-family: sans-serif;
}
@media (max-width: 600px) { .wt-achv-title { font-size: 16px; } }
.wt-achv-letter {
  display: inline-block; opacity: 0;
  animation: wt-achv-letter .45s cubic-bezier(.2, 1.4, .4, 1) both;
}
@keyframes wt-achv-letter {
  0% { transform: translateY(16px) scale(.6); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.wt-achv-name {
  margin-top: 6px; font-size: 14px; color: #e8ddba; opacity: 0; text-align: center;
  font-family: sans-serif;
  animation: wt-achv-name .5s ease-out ${T.NAME_DELAY}s both;
}
@keyframes wt-achv-name {
  0% { transform: translateY(8px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.wt-achv-target-pulse {
  position: fixed; z-index: 100001; width: 48px; height: 48px; border-radius: 999px;
  border: 2px solid rgba(245, 198, 46, .8); pointer-events: none;
  transform: translate(-50%, -50%);
  animation: wt-achv-target-pulse .9s ease-out both;
}
@keyframes wt-achv-target-pulse {
  0% { box-shadow: 0 0 0 0 rgba(245, 198, 46, 0); opacity: 1; }
  35% { box-shadow: 0 0 0 10px rgba(245, 198, 46, .28); border-color: #f5c62e; }
  100% { box-shadow: 0 0 0 16px rgba(245, 198, 46, 0); opacity: 0; }
}`;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* MR billboard                                                        */
/* ------------------------------------------------------------------ */

const MR_DISTANCE_M = 1.2;
const MR_PLANE_W_M = 0.62;
const MR_PLANE_H_M = 0.36;
const MR_CANVAS_W = 1024;
const MR_CANVAS_H = 600;
/** Badge centre/radius in canvas pixels; the 3D flame sits over this disc. */
const MR_BADGE_X = MR_CANVAS_W / 2;
const MR_BADGE_Y = 218;
const MR_BADGE_R = 96;

const MR_VERT = `
attribute float aIn;
varying vec3 vN; varying vec3 vC; varying float vIn;
void main() {
  vN = normalize(normalMatrix * normal);
  vC = color;
  vIn = aIn;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

interface MrNodes {
  root: Object3D;
  inner: Object3D;
  plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  flame: Mesh<BufferGeometry, ShaderMaterial> | null;
  pulse: Mesh<RingGeometry, MeshBasicMaterial>;
  holdPos: Vector3;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

/** Draw one frame of the approved choreography onto the MR panel canvas. */
function drawMrFrame(ctx: CanvasRenderingContext2D, t: number, name: string, icon: HTMLImageElement | null, hasFlame: boolean): void {
  const w = MR_CANVAS_W, h = MR_CANVAS_H;
  ctx.clearRect(0, 0, w, h);

  // Translucent billboard panel.
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 42);
  ctx.fillStyle = 'rgba(18, 22, 32, .55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, .18)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Soft flash.
  const ft = clamp01((t - T.FLASH_DELAY) / T.FLASH);
  if (ft > 0 && ft < 1) {
    const scale = 0.2 + 0.95 * easeOutCubic(ft);
    const alpha = ft < 0.3 ? ft / 0.3 : 1 - (ft - 0.3) / 0.7;
    const r = 260 * scale;
    const g = ctx.createRadialGradient(MR_BADGE_X, MR_BADGE_Y, 0, MR_BADGE_X, MR_BADGE_Y, r);
    g.addColorStop(0, `rgba(255, 226, 130, ${0.5 * alpha})`);
    g.addColorStop(1, 'rgba(255, 226, 130, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Expanding glow ring.
  const rt = clamp01((t - T.RING_DELAY) / T.RING);
  if (rt > 0 && rt < 1) {
    const e = easeOutCubic(rt);
    ctx.beginPath();
    ctx.arc(MR_BADGE_X, MR_BADGE_Y, MR_BADGE_R * (0.3 + 2.3 * e), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(245, 198, 46, ${0.95 * (1 - e)})`;
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // Sparks.
  const st = clamp01((t - T.SPARKS_DELAY) / T.SPARKS);
  if (st > 0 && st < 1) {
    const e = easeOutCubic(st);
    for (const s of SPARKS) {
      const a = (s.angle * Math.PI) / 180;
      const d = s.dist * e * 0.85;
      const x = MR_BADGE_X + Math.cos(a) * d;
      const y = MR_BADGE_Y + Math.sin(a) * d;
      const size = 7 * (1 - 0.85 * e);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = `rgba(255, 226, 130, ${1 - e})`;
      ctx.shadowColor = 'rgba(245, 198, 46, .9)';
      ctx.shadowBlur = 8;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  // Badge disc with the pulsing gold glow from t=0.6.
  const glowOn = t >= 0.6;
  const pulse = glowOn ? 0.5 + 0.5 * Math.sin(((t - 0.6) / 1.5) * Math.PI * 2) : 0;
  const gold = ctx.createRadialGradient(
    MR_BADGE_X - MR_BADGE_R * 0.4, MR_BADGE_Y - MR_BADGE_R * 0.42, MR_BADGE_R * 0.1,
    MR_BADGE_X, MR_BADGE_Y, MR_BADGE_R,
  );
  gold.addColorStop(0, '#ffe9a8');
  gold.addColorStop(0.38, '#f5c62e');
  gold.addColorStop(0.78, '#c8901a');
  gold.addColorStop(1, '#8a630c');
  ctx.save();
  ctx.shadowColor = 'rgba(245, 198, 46, .8)';
  ctx.shadowBlur = 24 + 26 * pulse;
  ctx.beginPath();
  ctx.arc(MR_BADGE_X, MR_BADGE_Y, MR_BADGE_R, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(MR_BADGE_X, MR_BADGE_Y, MR_BADGE_R, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Shimmer sweep across the badge.
  const sht = clamp01((t - 0.85) / 1.1);
  if (sht > 0 && sht < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(MR_BADGE_X, MR_BADGE_Y, MR_BADGE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(MR_BADGE_X, MR_BADGE_Y);
    ctx.rotate((-25 * Math.PI) / 180);
    const bandX = -MR_BADGE_R * 2 + MR_BADGE_R * 4 * sht;
    const band = ctx.createLinearGradient(bandX - 34, 0, bandX + 34, 0);
    const bandA = sht < 0.15 ? sht / 0.15 : 1 - (sht - 0.15) / 0.85;
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, `rgba(255,255,255,${0.75 * bandA})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(-MR_BADGE_R * 2, -MR_BADGE_R * 2, MR_BADGE_R * 4, MR_BADGE_R * 4);
    ctx.restore();
  }

  // Dark inner disc; the 2D logo art when this category has no 3D mesh.
  const discR = MR_BADGE_R * 0.72;
  const disc = ctx.createRadialGradient(
    MR_BADGE_X - discR * 0.3, MR_BADGE_Y - discR * 0.35, discR * 0.1,
    MR_BADGE_X, MR_BADGE_Y, discR,
  );
  disc.addColorStop(0, '#33363d');
  disc.addColorStop(0.7, '#24262b');
  disc.addColorStop(1, '#17181c');
  ctx.beginPath();
  ctx.arc(MR_BADGE_X, MR_BADGE_Y, discR, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  if (!hasFlame && icon != null && icon.complete && icon.naturalWidth > 0) {
    const s = discR * 1.2;
    ctx.drawImage(icon, MR_BADGE_X - s / 2, MR_BADGE_Y - s / 2, s, s);
  }

  // Letter cascade.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 44px sans-serif`;
  const spacing = 44 * 0.8 + 44 * 0.16;
  const totalW = (TITLE_WORD.length - 1) * spacing;
  for (let i = 0; i < TITLE_WORD.length; i++) {
    const lt = clamp01((t - T.LETTERS_DELAY - i * T.LETTER_STAGGER) / 0.45);
    if (lt <= 0) continue;
    const e = easeOutCubic(lt);
    const x = MR_BADGE_X - totalW / 2 + i * spacing;
    const y = 428 + (1 - e) * 16;
    ctx.fillStyle = `rgba(255, 233, 168, ${lt})`;
    ctx.shadowColor = 'rgba(245, 198, 46, .65)';
    ctx.shadowBlur = 14;
    ctx.fillText(TITLE_WORD[i]!, x, y);
    ctx.shadowBlur = 0;
  }

  // Achievement name.
  const nt = clamp01((t - T.NAME_DELAY) / 0.5);
  if (nt > 0) {
    ctx.font = `400 34px sans-serif`;
    ctx.fillStyle = `rgba(232, 221, 186, ${nt})`;
    ctx.fillText(name, MR_BADGE_X, 500 - (1 - easeOutCubic(nt)) * 8);
  }
}

/* ------------------------------------------------------------------ */
/* The celebration driver                                              */
/* ------------------------------------------------------------------ */

interface QueuedShow {
  def: AchievementDef;
  targetWorld: Vector3 | null;
}

interface ActiveShow extends QueuedShow {
  elapsed: number;
  flat: boolean;
  pulsed: boolean;
  /** Flat overlay nodes. */
  root: HTMLDivElement | null;
  flameCanvas: FlatFlameCanvas | null;
  pulseDiv: HTMLDivElement | null;
  /** MR nodes (created on first immersive show). */
  mr: MrNodes | null;
}

export class AchievementCelebration {
  private readonly queue: QueuedShow[] = [];
  private active: ActiveShow | null = null;
  private mr: MrNodes | null = null;
  private readonly icons = new Map<string, HTMLImageElement>();
  private readonly scratch = new Vector3();
  private readonly scratchQuat = new Quaternion();

  /** Queue one unlock; plays immediately when nothing is showing. */
  show(def: AchievementDef, targetWorld: Vector3 | null): void {
    this.queue.push({ def, targetWorld: targetWorld?.clone() ?? null });
  }

  /** Shows whose sound effects were requested (test-only). */
  private sfxPlays = 0;

  debugSfxPlays(): number {
    return this.sfxPlays;
  }

  isActive(): boolean {
    return this.active != null || this.queue.length > 0;
  }

  /** Test-only read: "title|name" of the showing celebration, else null. */
  debugText(): string | null {
    if (this.active == null) return null;
    return `${TITLE_WORD}|${this.active.def.label}`;
  }

  /** Test-only: freeze the show clock (with CSS paused page-side this gives
   * deterministic visual-verification frames regardless of capture latency). */
  public frozen = false;

  /** Advance the active show; starts queued shows. */
  update(delta: number, camera: Camera, scene: Scene, flat: boolean): void {
    if (this.active == null) {
      const next = this.queue.shift();
      if (next != null) this.start(next, camera, scene, flat);
      return;
    }
    if (this.frozen) return;
    // A flat/immersive swap mid-show replays it in the new view mode.
    if (this.active.flat !== flat) {
      this.teardownVisual(this.active, scene);
      const again: QueuedShow = { def: this.active.def, targetWorld: this.active.targetWorld };
      this.active = null;
      this.start(again, camera, scene, flat);
      return;
    }
    const show = this.active;
    show.elapsed += delta;
    if (!show.pulsed && show.elapsed >= T.TARGET_PULSE) {
      show.pulsed = true;
      this.spawnTargetPulse(show, camera, scene);
    }
    if (show.flat) {
      // The CSS choreography drives itself; nothing per-frame here.
    } else {
      this.updateMr(show, camera, delta);
    }
    if (show.elapsed >= T.TOTAL) {
      this.teardownVisual(show, scene);
      this.active = null;
      const next = this.queue.shift();
      if (next != null) this.start(next, camera, scene, flat);
    }
  }

  /** Hide everything (experience end / mode teardown). */
  clear(scene: Scene): void {
    if (this.active != null) {
      this.teardownVisual(this.active, scene);
      this.active = null;
    }
    this.queue.length = 0;
  }

  /** Release MR GPU resources for good (system dispose). */
  dispose(scene: Scene): void {
    this.clear(scene);
    if (this.mr != null) {
      scene.remove(this.mr.root);
      scene.remove(this.mr.pulse);
      this.mr.texture.dispose();
      this.mr.plane.geometry.dispose();
      this.mr.plane.material.dispose();
      this.mr.flame?.geometry.dispose();
      this.mr.flame?.material.dispose();
      this.mr.pulse?.geometry.dispose();
      this.mr.pulse?.material.dispose();
      this.mr = null;
    }
  }

  /* ------------------------------ internals ------------------------------ */

  private start(next: QueuedShow, camera: Camera, scene: Scene, flat: boolean): void {
    const show: ActiveShow = {
      ...next,
      elapsed: 0,
      flat,
      pulsed: false,
      root: null,
      flameCanvas: null,
      pulseDiv: null,
      mr: null,
    };
    this.active = show;
    this.sfxPlays += 1;
    void playAchievementCelebrationSfx();
    if (flat) {
      this.buildFlatDom(show, camera);
    } else {
      this.startMrShow(show, camera, scene);
    }
  }

  private categoryId(def: AchievementDef): string {
    const dash = def.id.indexOf('-');
    return dash === -1 ? def.id : def.id.slice(0, dash);
  }

  private iconFor(catId: string): HTMLImageElement | null {
    const cached = this.icons.get(catId);
    if (cached != null) return cached;
    const src = ACHIEVEMENT_ICON_PNG[catId];
    if (src == null) return null;
    const img = new Image();
    img.src = src;
    this.icons.set(catId, img);
    return img;
  }

  /* ------------------------------ flat DOM ------------------------------ */

  private buildFlatDom(show: ActiveShow, camera: Camera): void {
    ensureFlatStyle();
    const root = document.createElement('div');
    root.className = 'wt-achv-celebration';
    root.setAttribute('aria-hidden', 'true');

    const fly = document.createElement('div');
    fly.className = 'wt-achv-fly';
    // Fly target: the Achievements button projected to the screen. The flat
    // camera is static during the show, so one projection is enough.
    let dx = 0, dy = window.innerHeight * 0.4;
    if (show.targetWorld != null) {
      const v = this.scratch.copy(show.targetWorld).project(camera);
      if (v.z < 1) {
        dx = ((v.x + 1) * window.innerWidth) / 2 - window.innerWidth / 2;
        dy = ((1 - v.y) * window.innerHeight) / 2 - window.innerHeight / 2;
      }
    }
    fly.style.setProperty('--dx', `${dx}px`);
    fly.style.setProperty('--dy', `${dy}px`);

    const pop = document.createElement('div');
    pop.className = 'wt-achv-pop';

    const flash = document.createElement('div');
    flash.className = 'wt-achv-flash';
    pop.appendChild(flash);

    const sparks = document.createElement('div');
    sparks.className = 'wt-achv-sparks';
    SPARKS.forEach((s, i) => {
      const spark = document.createElement('span');
      spark.className = 'wt-achv-spark';
      spark.style.setProperty('--a', `${s.angle}deg`);
      spark.style.setProperty('--d', `${s.dist}px`);
      spark.style.animationDelay = `${T.SPARKS_DELAY + (i % 4) * 0.03}s`;
      sparks.appendChild(spark);
    });
    pop.appendChild(sparks);

    const ring = document.createElement('div');
    ring.className = 'wt-achv-ring';
    pop.appendChild(ring);

    const badge = document.createElement('div');
    badge.className = 'wt-achv-badge';
    const shimmer = document.createElement('div');
    shimmer.className = 'wt-achv-badge-shimmer';
    badge.appendChild(shimmer);
    const disc = document.createElement('div');
    disc.className = 'wt-achv-badge-disc';
    const catId = this.categoryId(show.def);
    if (catId === 'streak') {
      const canvas = document.createElement('canvas');
      canvas.className = 'wt-achv-flame';
      canvas.style.width = '74px';
      canvas.style.height = '74px';
      const flame = new FlatFlameCanvas(canvas, 74);
      if (flame.ok) {
        show.flameCanvas = flame;
        disc.appendChild(canvas);
      } else {
        flame.stop();
        const img = this.iconFor(catId);
        if (img != null) disc.appendChild(img);
      }
    } else {
      const img = this.iconFor(catId);
      if (img != null) disc.appendChild(img);
    }
    badge.appendChild(disc);
    pop.appendChild(badge);

    const copy = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'wt-achv-title';
    TITLE_WORD.split('').forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'wt-achv-letter';
      span.style.animationDelay = `${T.LETTERS_DELAY + i * T.LETTER_STAGGER}s`;
      span.textContent = ch === ' ' ? ' ' : ch;
      title.appendChild(span);
    });
    copy.appendChild(title);
    const name = document.createElement('div');
    name.className = 'wt-achv-name';
    name.textContent = show.def.label;
    copy.appendChild(name);
    pop.appendChild(copy);

    fly.appendChild(pop);
    root.appendChild(fly);
    document.body.appendChild(root);
    show.root = root;
  }

  private spawnTargetPulse(show: ActiveShow, camera: Camera, scene: Scene): void {
    if (show.targetWorld == null) return;
    if (show.flat) {
      const v = this.scratch.copy(show.targetWorld).project(camera);
      if (v.z >= 1) return;
      const div = document.createElement('div');
      div.className = 'wt-achv-target-pulse';
      div.style.left = `${((v.x + 1) * window.innerWidth) / 2}px`;
      div.style.top = `${((1 - v.y) * window.innerHeight) / 2}px`;
      document.body.appendChild(div);
      show.pulseDiv = div;
      window.setTimeout(() => {
        div.remove();
        if (show.pulseDiv === div) show.pulseDiv = null;
      }, 950);
    } else if (this.mr != null) {
      const pulse = this.mr.pulse;
      pulse.position.copy(show.targetWorld);
      pulse.scale.setScalar(1);
      pulse.material.opacity = 0.9;
      pulse.visible = true;
    }
  }

  /* ------------------------------ MR ------------------------------ */

  private ensureMrNodes(camera: Camera, scene: Scene): MrNodes {
    if (this.mr != null) return this.mr;
    const root = new Object3D();
    root.name = 'AchievementCelebration';
    root.visible = false;
    const inner = new Object3D();
    root.add(inner);

    const canvas = document.createElement('canvas');
    canvas.width = MR_CANVAS_W;
    canvas.height = MR_CANVAS_H;
    const ctx = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(
      new PlaneGeometry(MR_PLANE_W_M, MR_PLANE_H_M),
      new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    plane.renderOrder = 998;
    inner.add(plane);

    // The approved 3D pilot: the Streak flame as a real rotating mesh.
    let flame: Mesh<BufferGeometry, ShaderMaterial> | null = null;
    const data = buildFlameMeshData();
    if (data != null) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(data.positions, 3));
      geo.setAttribute('normal', new BufferAttribute(data.normals, 3));
      geo.setAttribute('color', new BufferAttribute(data.colors, 3));
      geo.setAttribute('aIn', new BufferAttribute(data.inside, 1));
      geo.setIndex(new BufferAttribute(data.indices, 1));
      const mat = new ShaderMaterial({
        vertexShader: MR_VERT,
        fragmentShader: FLAME_FRAG,
        uniforms: { uOpacity: { value: 1 } },
        transparent: true,
        depthTest: false,
        vertexColors: true,
      });
      flame = new Mesh(geo, mat);
      flame.renderOrder = 999;
      // Badge disc position on the plane, flame sized to sit inside it.
      const x = ((MR_BADGE_X / MR_CANVAS_W) - 0.5) * MR_PLANE_W_M;
      const y = (0.5 - MR_BADGE_Y / MR_CANVAS_H) * MR_PLANE_H_M;
      flame.position.set(x, y, 0.012);
      const r = (MR_BADGE_R * 0.62 / MR_CANVAS_W) * MR_PLANE_W_M; // mesh spans -1..1
      flame.scale.setScalar(r);
      flame.visible = false;
      inner.add(flame);
    }

    // Achievements-button pulse ring (spawned at TARGET_PULSE). Lives in
    // the scene, not under the billboarded root: its position is a world
    // coordinate (the button's), and the root moves/scales during the fly.
    const pulse = new Mesh(
      new RingGeometry(0.055, 0.068, 40),
      new MeshBasicMaterial({ color: 0xf5c62e, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    pulse.renderOrder = 999;
    pulse.visible = false;

    scene.add(root);
    scene.add(pulse);
    this.mr = { root, inner, plane, canvas, ctx, texture, flame, pulse, holdPos: new Vector3() };
    return this.mr;
  }

  private startMrShow(show: ActiveShow, camera: Camera, scene: Scene): void {
    const mr = this.ensureMrNodes(camera, scene);
    show.mr = mr;
    // Billboard in front of the player at eye height, world-locked for the
    // show (approved prototype: floats ahead, then folds into the chip).
    camera.getWorldPosition(mr.holdPos);
    this.scratch.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(this.scratchQuat));
    mr.holdPos.addScaledVector(this.scratch, MR_DISTANCE_M);
    mr.root.position.copy(mr.holdPos);
    mr.root.visible = true;
    mr.root.scale.setScalar(1);
    mr.plane.material.opacity = 1;
    mr.pulse.visible = false;
    if (mr.flame != null) {
      mr.flame.visible = this.categoryId(show.def) === 'streak';
      mr.flame.rotation.set(0, 0, 0);
      mr.flame.material.uniforms['uOpacity']!.value = 1;
    }
    this.updateMr(show, camera, 0);
  }

  private updateMr(show: ActiveShow, camera: Camera, delta: number): void {
    const mr = show.mr;
    if (mr == null) return;
    const t = show.elapsed;

    // Billboard: face the player every frame.
    mr.root.lookAt(camera.getWorldPosition(this.scratch));

    if (t < T.FLY_START) {
      // Pop-in with the overshoot and flip from the prototype's pop-in,
      // then idle float; the panel canvas draws its own beats.
      const pt = clamp01(t / T.POP);
      const back = pt < 1 ? 1 + 1.5 * Math.sin(Math.PI * Math.min(pt * 1.2, 1)) * (1 - pt) : 1;
      const scale = 0.2 + 0.8 * easeOutCubic(pt);
      mr.inner.scale.setScalar(scale * (pt < 1 ? back : 1));
      mr.inner.rotation.y = (1 - easeOutCubic(pt)) * (Math.PI / 2) * 0.6;
      mr.inner.position.y = pt >= 1 ? Math.sin(((t - T.POP) / 2.4) * Math.PI * 2) * 0.008 : 0;
      mr.plane.material.opacity = pt;
      if (mr.flame != null && mr.flame.visible) {
        mr.flame.rotation.y += delta * 1.1;
        mr.flame.rotation.x = 0.16;
      }
    } else {
      // Fly into the Achievements button: shrink and arc to the target.
      const ft = clamp01((t - T.FLY_START) / T.FLY);
      const e = ft * ft * (3 - 2 * ft); // smoothstep, close to the CSS cubic
      if (show.targetWorld != null) {
        mr.root.position.lerpVectors(mr.holdPos, show.targetWorld, e);
        mr.root.position.y += Math.sin(Math.PI * e) * 0.1;
      }
      const s = 1 - 0.9 * e;
      mr.root.scale.setScalar(Math.max(s, 0.001));
      const fade = ft < 0.7 ? 1 : 1 - (ft - 0.7) / 0.3;
      mr.plane.material.opacity = fade;
      if (mr.flame != null && mr.flame.visible) {
        mr.flame.material.uniforms['uOpacity']!.value = fade;
      }
    }

    // Achievements-button pulse ring.
    if (mr.pulse.visible) {
      const pt = clamp01((t - T.TARGET_PULSE) / 0.9);
      if (pt >= 1) {
        mr.pulse.visible = false;
      } else {
        mr.pulse.scale.setScalar(1 + 1.6 * easeOutCubic(pt));
        mr.pulse.material.opacity = 0.9 * (1 - pt);
        mr.pulse.lookAt(camera.getWorldPosition(this.scratch));
      }
    }

    drawMrFrame(
      mr.ctx,
      t,
      show.def.label,
      this.iconFor(this.categoryId(show.def)),
      mr.flame?.visible === true,
    );
    mr.texture.needsUpdate = true;
  }

  private teardownVisual(show: ActiveShow, scene: Scene): void {
    show.flameCanvas?.stop();
    show.flameCanvas = null;
    show.root?.remove();
    show.root = null;
    show.pulseDiv?.remove();
    show.pulseDiv = null;
    if (show.mr != null) {
      show.mr.root.visible = false;
      // The gold target pulse outlives the show clock (TARGET_PULSE 2.55s
      // plus its 0.9s fade ends after TOTAL 3.1s), so updateMr never gets
      // to hide it: without this it stays stuck on the Achievements
      // button after the show (user report, November 14).
      show.mr.pulse.visible = false;
      show.mr = null;
    }
    void scene;
  }
}
