import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Transpile the production placement module and its constants into a local
// build dir so the test imports the real code, not a copy. Bare specifiers
// (@iwsdk/core) resolve through the repo's node_modules from here.
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
mkdirSync(buildDir, { recursive: true });
for (const name of ['constants', 'plane-placement']) {
  const source = readFileSync(join(here, `../../src/wall-tones/${name}.ts`), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(join(buildDir, `${name}.js`), js);
}
const placement = await import(join(buildDir, 'plane-placement.js'));
const constants = await import(join(buildDir, 'constants.js'));
const { Object3D } = await import('@iwsdk/core');

function makeTable(widthM, depthM) {
  const object3D = new Object3D();
  return {
    entity: { object3D },
    normal: { x: 0, y: 1, z: 0 },
    localMinX: -widthM / 2,
    localMaxX: widthM / 2,
    localMinZ: -depthM / 2,
    localMaxZ: depthM / 2,
  };
}

test('default table pads fit four on a large table, no shrink needed', () => {
  const candidates = placement.generateTablePadCandidates([makeTable(1.2, 1.2)]);
  assert.equal(candidates.length >= 4, true);
  assert.equal(placement.maxCandidatesOnOneSurface(candidates) >= 4, true);
});

test('0.7m table fits four only after shrinking to the fallback size', () => {
  const tables = [makeTable(0.7, 0.7)];
  const defaults = placement.generateTablePadCandidates(tables);
  assert.equal(placement.maxCandidatesOnOneSurface(defaults) < 4, true);
  const small = placement.generateTablePadCandidates(
    tables,
    constants.TABLE_PAD_FALLBACK_SIZE_M,
  );
  assert.equal(placement.maxCandidatesOnOneSurface(small) >= 4, true);
});

test('per-surface max ignores candidates pooled across tables', () => {
  const tables = [makeTable(0.6, 1.4), makeTable(0.6, 1.4)];
  const candidates = placement.generateTablePadCandidates(tables);
  assert.equal(candidates.length >= 4, true);
  assert.equal(placement.maxCandidatesOnOneSurface(candidates) < 4, true);
});
