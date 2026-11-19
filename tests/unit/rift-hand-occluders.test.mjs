import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'src/rift-lab/rift-hand-occluders.ts'), 'utf8');
// Pure helpers only: strip the three.js imports and class before transpiling.
const pure = src
  .replace(/import[\s\S]*?from '@iwsdk\/core';/, '')
  .replace(/import { type PalmPose } from '.\/rift-hands.js';/, '')
  .replace(/const sharedSphereGeo[\s\S]*$/, '');
const js = ts.transpileModule(pure, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { OCCLUDER_BONES, handScaleFromJoints, computePalmHull, NOMINAL_WRIST_TO_PALM_M } =
  await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

/** Flat synthetic right hand: wrist at origin, fingers along +y. */
function flatHand() {
  const j = new Array(75).fill(0);
  const set = (i, x, y, z) => { j[i * 3] = x; j[i * 3 + 1] = y; j[i * 3 + 2] = z; };
  set(0, 0, 0, 0);            // wrist
  set(5, -0.035, 0.075, 0);   // index metacarpal
  set(10, 0, 0.085, 0);       // middle metacarpal
  set(15, 0.02, 0.078, 0);    // ring metacarpal
  set(20, 0.037, 0.07, 0);    // pinky metacarpal
  return j;
}

test('occluder bones cover every finger and stay inside the 25-joint hand', () => {
  assert.equal(OCCLUDER_BONES.length, 19); // 4 bones x 4 fingers + 3 thumb
  const spans = new Set(OCCLUDER_BONES.map((b) => `${b.a}-${b.b}`));
  assert.equal(spans.size, 19); // no duplicate bones
  for (const b of OCCLUDER_BONES) {
    assert.ok(b.a >= 0 && b.a < 25 && b.b >= 0 && b.b < 25);
    assert.ok(b.r > 0 && b.len > 0);
  }
});

test('hand scale follows the wrist to middle-metacarpal span', () => {
  assert.ok(Math.abs(handScaleFromJoints(flatHand()) - 1) < 1e-6);
  const big = flatHand().map((v) => v * 2);
  assert.ok(Math.abs(handScaleFromJoints(big) - 2) < 1e-6);
  assert.equal(handScaleFromJoints(new Array(75).fill(0)), 1); // degenerate
});

test('palm hull basis is orthonormal with extents from the joints', () => {
  const hull = computePalmHull(flatHand());
  assert.ok(hull);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(Math.abs(dot(hull.xAxis, hull.yAxis)) < 1e-6);
  assert.ok(Math.abs(dot(hull.xAxis, hull.zAxis)) < 1e-6);
  assert.ok(Math.abs(dot(hull.yAxis, hull.zAxis)) < 1e-6);
  assert.ok(Math.abs(hull.halfX - Math.hypot(0.072, 0.005) * 0.62) < 1e-6); // index->pinky span
  assert.ok(Math.abs(hull.halfY - NOMINAL_WRIST_TO_PALM_M * 0.68) < 1e-6);
  assert.ok(hull.halfZ > 0);
  // Center is the average of wrist and the three fitted metacarpals.
  assert.ok(Math.abs(hull.center[1] - (0 + 0.075 + 0.085 + 0.07) / 4) < 1e-6);
});

test('palm hull refuses a degenerate hand', () => {
  assert.equal(computePalmHull(new Array(75).fill(0)), null);
});
