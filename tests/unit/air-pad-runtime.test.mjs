import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Behavioral tests for the MR air-placement fixes (Oded's headset test,
// 2026-11-12 01:19): pads placed in fanfare order are not in id order in the
// array, and solidified ghosts must become RayInteractable. These exercise
// the real transpiled modules, not source text.
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
mkdirSync(buildDir, { recursive: true });
for (const mod of ['constants', 'pad-glow', 'wall-tone-pad-component', 'pads']) {
  const source = readFileSync(join(here, `../../src/wall-tones/${mod}.ts`), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(join(buildDir, `${mod}.js`), js);
}
const { WALL_TONE_PADS, SIMON_FANFARE_PAD_ORDER } = await import(join(buildDir, 'constants.js'));
const { findPadById, solidifyGhostPad } = await import(join(buildDir, 'pads.js'));
const { RayInteractable } = await import('@iwsdk/core');
const { Mesh, MeshBasicMaterial, BoxGeometry, Object3D } = await import('three');

test('every fanfare note resolves to the pad with that id in a shuffled array', () => {
  // Pads array in air-placement (fanfare) order: green, red, yellow, blue.
  const placed = SIMON_FANFARE_PAD_ORDER.map((id) => ({
    padIndex: id,
    name: WALL_TONE_PADS[id].name,
  }));
  assert.deepEqual(
    placed.map((p) => p.name),
    ['green', 'red', 'yellow', 'blue'],
  );
  // The bug: positional lookup pads[noteId] returned the wrong pad for
  // yellow/blue. Prove position and id genuinely diverge here.
  assert.notEqual(placed[3].padIndex, 3);
  assert.notEqual(placed[2].padIndex, 2);
  for (const noteId of SIMON_FANFARE_PAD_ORDER) {
    const pad = findPadById(placed, noteId);
    assert.equal(pad?.padIndex, noteId, `note ${noteId} resolves to its own pad`);
  }
  // Press path: pressing the physical yellow pad (id 3) must read as id 3.
  const yellowPad = placed[2];
  assert.equal(yellowPad.name, 'yellow');
  assert.equal(findPadById(placed, yellowPad.padIndex), yellowPad);
  assert.equal(findPadById(placed, 99), undefined);
});

test('solidifyGhostPad adds RayInteractable to the pad entity', () => {
  const components = new Set();
  const entity = {
    hasComponent: (c) => components.has(c),
    addComponent: (c) => components.add(c),
  };
  const root = new Object3D();
  const face = new Mesh(new BoxGeometry(1, 1, 0.02), new MeshBasicMaterial());
  face.name = 'face';
  root.add(face);
  const pad = {
    entity,
    root,
    padIndex: 3,
    sizeM: 1,
    isGhost: true,
    visualState: 'idle',
    // Non-Mesh stand-ins: resizeTouchVolumes skips anything that is not a Mesh.
    touchVolume: new Object3D(),
    hoverVolume: new Object3D(),
    debugPressMesh: new Object3D(),
    debugHoverMesh: new Object3D(),
    glow: undefined,
  };
  solidifyGhostPad(pad, 1);
  assert.equal(pad.isGhost, false);
  assert.ok(components.has(RayInteractable), 'solidified pad answers controller/hand rays');
  // Idempotent: an already-solid pad is untouched (no duplicate component add).
  solidifyGhostPad(pad, 1);
  assert.equal(components.size, 1);
});
