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

test('table pads align their yaw with a rotated table plane', () => {
  const yaw = Math.PI / 4;
  const table = makeTable(1.2, 1.2);
  table.entity.object3D.rotation.y = yaw;
  const candidates = placement.generateTablePadCandidates([table]);
  assert.equal(candidates.length > 0, true);
  // q = qYaw * qFlat (same composition as the production helper).
  const f = Math.sin(-Math.PI / 4);
  const g = Math.cos(-Math.PI / 4);
  const s = Math.sin(yaw * 0.5);
  const c = Math.cos(yaw * 0.5);
  const expected = [c * f, s * g, -s * f, c * g];
  for (const candidate of candidates) {
    for (let i = 0; i < 4; i += 1) {
      assert.ok(
        Math.abs(candidate.quaternion[i] - expected[i]) < 1e-9,
        `quaternion[${i}] ${candidate.quaternion[i]} != ${expected[i]}`,
      );
    }
  }
});

test('arrangement prefers a centered 2x2 lineup', () => {
  const size = constants.TABLE_PAD_FALLBACK_SIZE_M;
  const tables = [makeTable(0.6, 0.6)];
  const arranged = placement.generateTablePadArrangements(tables, size);
  assert.equal(arranged.length, 4);
  const pitch = size + 0.08;
  const xs = arranged.map((c) => c.position[0]).sort((a, b) => a - b);
  const zs = arranged.map((c) => c.position[2]).sort((a, b) => a - b);
  // Two distinct X and two distinct Z values, one pitch apart.
  assert.ok(Math.abs(xs[1] - xs[0]) < 1e-6);
  assert.ok(Math.abs(xs[3] - xs[2]) < 1e-6);
  assert.ok(Math.abs(xs[2] - xs[1] - pitch) < 1e-6);
  assert.ok(Math.abs(zs[1] - zs[0]) < 1e-6);
  assert.ok(Math.abs(zs[3] - zs[2]) < 1e-6);
  assert.ok(Math.abs(zs[2] - zs[1] - pitch) < 1e-6);
});

test('arrangement falls back to a row of four on a narrow table', () => {
  const size = constants.AIR_PLACE_SITTING_PAD_SIZE_M;
  // Too shallow for 2x2 (needs 2 * 0.36 + 0.08 = 0.8 depth), wide enough for a row.
  const tables = [makeTable(1.8, 0.5)];
  const arranged = placement.generateTablePadArrangements(tables, size);
  assert.equal(arranged.length, 4);
  const zs = arranged.map((c) => c.position[2]);
  for (const z of zs) {
    assert.ok(Math.abs(z - arranged[0].position[2]) < 1e-6);
  }
  const xs = arranged.map((c) => c.position[0]).sort((a, b) => a - b);
  const pitch = size + 0.08;
  for (let i = 1; i < 4; i += 1) {
    assert.ok(Math.abs(xs[i] - xs[i - 1] - pitch) < 1e-6);
  }
});

test('arrangement is empty when no table fits four at that size', () => {
  const tables = [makeTable(0.5, 0.5)];
  const arranged = placement.generateTablePadArrangements(
    tables,
    constants.AIR_PLACE_SITTING_PAD_SIZE_M,
  );
  assert.equal(arranged.length, 0);
});

function makeHorizontalPlane(y) {
  const object3D = new Object3D();
  object3D.position.set(0, y, 0);
  return {
    getValue: () => ({
      orientation: 'horizontal',
      polygon: [
        { x: -0.5, z: -0.5 },
        { x: 0.5, z: -0.5 },
        { x: 0.5, z: 0.5 },
        { x: -0.5, z: 0.5 },
      ],
    }),
    object3D,
  };
}

test('detectFloorY uses the lowest horizontal plane, not the eye estimate', () => {
  const entities = [makeHorizontalPlane(0.75), makeHorizontalPlane(0.02)];
  assert.ok(Math.abs(placement.detectFloorY(entities, 1.1) - 0.02) < 1e-9);
});

test('detectFloorY falls back to the eye estimate with no planes', () => {
  assert.ok(Math.abs(placement.detectFloorY([], 1.1) - (1.1 - 1.45)) < 1e-9);
});

test('a real floor plane is not collected as a table at sitting eye height', () => {
  const floor = makeHorizontalPlane(0.02);
  const table = makeHorizontalPlane(0.75);
  const floorY = placement.detectFloorY([floor, table], 1.1);
  const tables = placement.collectTablePlanes([floor, table], floorY);
  assert.equal(tables.length, 1);
  assert.ok(Math.abs(tables[0].center.y - 0.75) < 1e-6);
});

test('two tables choose 25cm and 20cm independently, in either input order', () => {
  for (const dimensions of [[0.70, 0.60], [0.60, 0.70]]) {
    const tables = dimensions.map(side => makeTable(side, side));
    const cells = placement.generateMixedTablePadCandidates(tables, constants.TABLE_PAD_SIZE_LADDER_M);
    assert.equal(cells.length, 8);
    dimensions.forEach((side, tableIndex) => {
      const onTable = cells.filter(c => c.wallIndex === tableIndex);
      assert.equal(onTable.length, 4);
      assert.ok(onTable.every(c => c.sizeM === (side === 0.70 ? 0.25 : 0.20)));
    });
    assert.equal(new Set(cells.map(c => c.candidateIndex)).size, 8);
  }
});

test('small table keeps available cells even when it cannot fit four', () => {
  const cells = placement.generateMixedTablePadCandidates([makeTable(1.2,1.2), makeTable(0.4,0.4)], constants.TABLE_PAD_SIZE_LADDER_M);
  assert.equal(cells.filter(c => c.wallIndex === 0).length, 4);
  assert.ok(cells.some(c => c.wallIndex === 1 && c.sizeM === 0.2));
});
