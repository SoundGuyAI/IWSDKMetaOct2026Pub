import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'rift-lab', 'rift-visual-flags.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  RIFT_VISUAL_LAYERS,
  RIFT_VISUAL_LAYER_LABELS,
  riftVisualLayerShown,
  setRiftVisualLayer,
  toggleRiftVisualLayer,
  riftVisualFlagsSnapshot,
} = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

test('every visual layer defaults to shown (no default behavior change)', () => {
  for (const layer of RIFT_VISUAL_LAYERS) {
    assert.equal(riftVisualLayerShown(layer), true, `${layer} defaults on`);
  }
});

test('the toggle set covers the five item-118 suspect layers', () => {
  assert.deepEqual([...RIFT_VISUAL_LAYERS], [
    'chargeNotes',
    'handAura',
    'handOccluders',
    'sealBeam',
    'sparks',
  ]);
  for (const layer of RIFT_VISUAL_LAYERS) {
    assert.equal(typeof RIFT_VISUAL_LAYER_LABELS[layer], 'string');
    assert.ok(RIFT_VISUAL_LAYER_LABELS[layer].length > 0);
  }
});

test('set hides and restores one layer without touching the others', () => {
  setRiftVisualLayer('chargeNotes', false);
  assert.equal(riftVisualLayerShown('chargeNotes'), false);
  for (const layer of RIFT_VISUAL_LAYERS) {
    if (layer !== 'chargeNotes') {
      assert.equal(riftVisualLayerShown(layer), true, `${layer} untouched`);
    }
  }
  setRiftVisualLayer('chargeNotes', true);
  assert.equal(riftVisualLayerShown('chargeNotes'), true);
});

test('toggle flips a layer and reports the new state', () => {
  assert.equal(toggleRiftVisualLayer('sealBeam'), false);
  assert.equal(riftVisualLayerShown('sealBeam'), false);
  assert.equal(toggleRiftVisualLayer('sealBeam'), true);
  assert.equal(riftVisualLayerShown('sealBeam'), true);
});

test('snapshot is a copy: mutating it does not change the live flags', () => {
  const snap = riftVisualFlagsSnapshot();
  snap.sparks = false;
  assert.equal(riftVisualLayerShown('sparks'), true);
  setRiftVisualLayer('sparks', false);
  assert.equal(riftVisualFlagsSnapshot().sparks, false);
  setRiftVisualLayer('sparks', true);
});
