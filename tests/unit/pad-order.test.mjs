import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Backlog item 50 (Oded, 2026-11-11): air-placed pads 1/2/3/4 must come in
// the same order as the fanfare notes. Oded confirmed 2026-11-12 00:41
// (option B): the fanfare order stays green, red, yellow, blue and air
// placement changes to match it.
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

test('fanfare order stays green, red, yellow, blue (ascending pitch)', () => {
  assert.deepEqual([...SIMON_FANFARE_PAD_ORDER], [0, 1, 3, 2]);
  assert.deepEqual(
    SIMON_FANFARE_PAD_ORDER.map((id) => WALL_TONE_PADS[id].name),
    ['green', 'red', 'yellow', 'blue'],
  );
});

test('air placement assigns pad ids in fanfare order', () => {
  // The ghost/pad for placement step N uses SIMON_FANFARE_PAD_ORDER[N % 4],
  // so placed pads 1/2/3/4 get ids 0/1/3/2 = green/red/yellow/blue.
  assert.match(systemSource, /SIMON_FANFARE_PAD_ORDER\[this\.airPlaceStep % 4\] as WallTonePadId/);
  assert.deepEqual(
    [0, 1, 2, 3].map(+step) => WALL_TONE_PADS[SIMON_FANFARE_PAD_ORDER[step % 4]].name),
    ['green', 'red', 'yellow', 'blue'],
  );
});
