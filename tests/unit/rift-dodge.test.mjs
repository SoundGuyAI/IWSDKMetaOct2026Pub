import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = ts.transpileModule(
  readFileSync(join(root, 'src/rift-lab/rift-dodge.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { riftPanelBlocked } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

// Viewer at origin eye height 1.6, panel 1 m ahead (-z), rift 3 m ahead.
const eye = [0, 1.6, 0];
const panel = [0, 1.7, -1];
const base = { eye, panel, blockDeg: 18, lateralM: 0.5, aimRays: [], uiRays: [] };

test('no rifts means no dodge', () => {
  assert.equal(riftPanelBlocked({ ...base, targets: [] }), false);
});

test('panel between the eyes and a rift occludes it', () => {
  assert.equal(riftPanelBlocked({ ...base, targets: [[0, 1.7, -3]] }), true);
});

test('a rift far off to the side is not occluded', () => {
  assert.equal(riftPanelBlocked({ ...base, targets: [[3, 1.7, -3]] }), false);
});

test('a rift in front of the panel (closer than it) is not blocked', () => {
  assert.equal(riftPanelBlocked({ ...base, targets: [[0, 1.7, -0.5]] }), false);
});

test('open-hand aim ray at a rift through the panel triggers the dodge', () => {
  // Rift off to the side of the eye line, but the hand points at it across
  // the panel from the hand position.
  const target = [2.5, 1.2, -3];
  const hand = { origin: [0.2, 1.2, -0.3], dir: [target[0] - 0.2, 0, target[2] + 0.3] };
  // Eye line alone does not block (rift is wide of the panel).
  assert.equal(riftPanelBlocked({ ...base, targets: [target] }), false);
  // Aim ray crosses the panel's bearing only if the panel is on its line.
  const aimed = { origin: [0, 1.2, 0], dir: [0, 0, -1] };
  assert.equal(
    riftPanelBlocked({ ...base, targets: [[0.2, 1.2, -3]], aimRays: [aimed] }),
    true,
  );
  assert.equal(
    riftPanelBlocked({ ...base, targets: [target], aimRays: [hand] }),
    false,
  );
});

test('aim ray pointing away from the rift does not trigger', () => {
  const away = { origin: [0, 1.2, 0], dir: [0, 0, 1] };
  assert.equal(
    riftPanelBlocked({ ...base, eye: [5, 1.6, 0], targets: [[0, 1.2, -3]], aimRays: [away] }),
    false,
  );
});

test('UI pointer ray at a rift behind the panel also triggers', () => {
  const ui = { origin: [0.1, 1.3, -0.2], dir: [0, 0.05, -1] };
  assert.equal(
    riftPanelBlocked({ ...base, eye: [5, 1.6, 0], targets: [[0.1, 1.45, -3]], uiRays: [ui] }),
    true,
  );
});
