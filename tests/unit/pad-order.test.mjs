import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Backlog item 50 (Oded, 2026-11-11): air-placed pads 1/2/3/4 must be
// green/red/blue/yellow, in the same order as the fanfare notes (G R B Y).
// Transpile the real constants module so the test reads production values.
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
mkdirSync(buildDir, { recursive: true });
const source = readFileSync(join(here, '../../src/wall-tones/constants.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync(join(buildDir, 'constants.js'), js);
const { WALL_TONE_PADS, SIMON_FANFARE_PAD_ORDER } = await import(join(buildDir, 'constants.js'));

const systemSource = readFileSync(join(here, '../../src/wall-tones/wall-tones-system.ts'), 'utf8');

test('pad ids 0-3 are green, red, blue, yellow', () => {
  assert.deepEqual(
    WALL_TONE_PADS.map((p) => p.name),
    ['green', 'red', 'blue', 'yellow'],
  );
});

test('fanfare plays pads in placement order: green, red, blue, yellow', () => {
  assert.deepEqual([...SIMON_FANFARE_PAD_ORDER], [0, 1, 2, 3]);
  assert.deepEqual(
    SIMON_FANFARE_PAD_ORDER.map((id) => WALL_TONE_PADS[id].name),
    ['green', 'red', 'blue', 'yellow'],
  );
});

test('air placement assigns pad ids in placement order (step % 4)', () => {
  // The ghost/pad for placement step N uses pad id N % 4, so placed pads
  // 1/2/3/4 get ids 0/1/2/3 = green/red/blue/yellow.
  assert.match(systemSource, /this\.airPlaceStep % 4\) as WallTonePadId/);
});
