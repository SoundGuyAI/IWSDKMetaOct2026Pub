import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Object3D, Quaternion, Vector3 } from 'three';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(root + '.placement-unit-');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let source = readFileSync(root + 'src/wall-tones/plane-placement.ts', 'utf8');
source = source.replace("import { Object3D, Quaternion, Vector3, XRPlane } from '@iwsdk/core';", "import { Object3D, Quaternion, Vector3 } from 'three'; const XRPlane = Symbol('XRPlane');");
writeFileSync(dir + '/constants.js', compile(readFileSync(root + 'src/wall-tones/constants.ts', 'utf8')));
writeFileSync(dir + '/placement.js', compile(source));
const placement = await import(pathToFileURL(dir + '/placement.js'));
rmSync(dir, { recursive: true });

function plane(y, { yaw = 0, label, parent = null, orientation = 'horizontal', width = 2, depth = 2 } = {}) {
  const object3D = new Object3D();
  object3D.position.y = y;
  object3D.rotation.y = yaw;
  parent?.add(object3D);
  const polygon = [{ x: -width/2, z: -depth/2 }, { x: width/2, z: -depth/2 }, { x: width/2, z: depth/2 }, { x: -width/2, z: depth/2 }];
  return { object3D, getValue: () => ({ orientation, semanticLabel: label, polygon }) };
}
function close(actual, expected, msg) { assert.ok(Math.abs(actual - expected) < 1e-8, `${msg}: ${actual} vs ${expected}`); }

test('seated viewer uses detected floor, excludes floor itself and keeps table', () => {
  const floor = plane(0), table = plane(.72);
  const floorY = placement.detectFloorY([table, floor], 1.15);
  close(floorY, 0, 'floor');
  assert.deepEqual(placement.collectTablePlanes([floor, table], floorY).map(t => t.entity), [table]);
});
test('semantic floor wins; lone table and empty scans retain fallback', () => {
  close(placement.detectFloorY([plane(-.15), plane(0, { label: 'floor' })], 1.2), 0, 'semantic floor');
  close(placement.detectFloorY([plane(.72)], 1.15), -.3, 'lone table fallback');
  close(placement.detectFloorY([], 1.15), -.3, 'empty fallback');
});
test('table pad edges follow world table yaw and remain face-up with combined metadata', () => {
  const parent = new Object3D(); parent.rotation.y = Math.PI / 6;
  const entity = plane(.72, { yaw: Math.PI / 4, parent });
  const tables = placement.collectTablePlanes([entity], 0);
  const candidates = placement.generateTablePadCandidates(tables, .36);
  assert.ok(candidates.length >= 4);
  for (const candidate of candidates) {
    const q = new Quaternion(...candidate.quaternion);
    const edge = new Vector3(1, 0, 0).applyQuaternion(q);
    const face = new Vector3(0, 0, 1).applyQuaternion(q);
    close(edge.x, Math.cos(5*Math.PI/12), 'edge X');
    close(edge.z, -Math.sin(5*Math.PI/12), 'edge Z');
    close(face.y, 1, 'face-up');
    assert.equal(candidate.sizeM, .36);
    assert.equal(candidate.kind, 'table');
  }
});
test('wall candidates retain per-candidate size and kind', () => {
  const entity = plane(1.4, { orientation: 'vertical', width: 3, depth: 3 });
  entity.object3D.rotation.x = Math.PI / 2;
  const candidates = placement.generateWallPadCandidates(placement.collectVerticalWalls([entity], { x: 0, y: 1.4, z: 2 }), 1.4, .5);
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) { assert.equal(candidate.sizeM, .5); assert.equal(candidate.kind, 'wall'); }
});
test('both sitting and combined routes use floor detection rather than standing-eye subtraction', () => {
  const system = readFileSync(root + 'src/wall-tones/wall-tones-system.ts', 'utf8');
  assert.equal((system.match(/const floorY = detectFloorY\(this\.planeEntityScratch, this\.viewer\.y\);/g) ?? []).length, 2);
  assert.doesNotMatch(system, /const floorY = this\.viewer\.y - 1\.45/);
});
