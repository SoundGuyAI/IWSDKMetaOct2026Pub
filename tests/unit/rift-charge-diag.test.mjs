import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'rift-lab', 'rift-charge-diag.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { summarizeChargeCloud, formatChargeCloudDiag } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const base = {
  immersive: true,
  leftPalm: null,
  rightPalm: null,
  head: [0, 1.6, 0],
  totalNotes: 72,
  visibleNotePositions: [],
};

test('no visible notes: no centroid, nothing parked', () => {
  const d = summarizeChargeCloud(base);
  assert.equal(d.visibleNotes, 0);
  assert.equal(d.centroid, null);
  assert.equal(d.centroidFromHeadM, null);
  assert.equal(d.centroidFromPalmM, null);
  assert.equal(d.totalNotes, 72);
});

test('cloud on a tracked palm reports a small palm distance', () => {
  const d = summarizeChargeCloud({
    ...base,
    rightPalm: [0.3, 1.2, -0.4],
    visibleNotePositions: [
      [0.28, 1.2, -0.4],
      [0.32, 1.2, -0.4],
    ],
  });
  assert.equal(d.rightTracked, true);
  assert.equal(d.leftTracked, false);
  assert.ok(d.centroidFromPalmM < 0.01);
  assert.ok(d.centroidFromHeadM > 0.5);
});

test('cloud left at a start pose with the palm elsewhere shows a large palm distance', () => {
  const d = summarizeChargeCloud({
    ...base,
    head: [1.5, 1.6, -2],
    rightPalm: [1.7, 1.2, -2.3],
    visibleNotePositions: [[-0.55, 1.0, -1.2]],
  });
  assert.ok(d.centroidFromPalmM > 1.5);
  assert.match(formatChargeCloudDiag(d), /XR, hands L none, R tracked, charge notes shown 1\/72/);
});

test('distance to palm uses the nearest tracked palm', () => {
  const d = summarizeChargeCloud({
    ...base,
    leftPalm: [-1, 1.2, 0],
    rightPalm: [0.1, 1.2, 0],
    visibleNotePositions: [[0, 1.2, 0]],
  });
  assert.ok(Math.abs(d.centroidFromPalmM - 0.1) < 1e-9);
});
