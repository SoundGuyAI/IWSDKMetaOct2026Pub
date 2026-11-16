import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Backlog 96 (Speed modifier): source wiring + economy behavior. The module
// loading mirrors store-tree-values.test.mjs: transpile economy.ts and
// inline/point its relative imports at data URLs.
const ui = readFileSync(
  new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url),
  'utf8',
);
const sys = readFileSync(
  new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url),
  'utf8',
);

test('speed modifier wiring: control-row slash/label, handler, store and playback hooks exist', () => {
  for (const id of ['id="control-speed-slash"', 'id="control-speed-label"']) {
    assert.ok(ui.includes(id), `uikitml missing ${id}`);
  }
  for (const snippet of [
    'onSpeedControl',
    'buyNextSpeedLevel',
    'speedNoteTimeFactor',
    'speedCoveredNoteCount',
    'SPEED_MAX_LEVEL',
    "case 'speed'",
    'pressSpeedControl',
    'grantSpeedLevel',
    'Speed engaged',
    'Speed disengaged',
  ]) {
    assert.ok(sys.includes(snippet), `system missing ${snippet}`);
  }
});

const src = readFileSync(new URL('../../src/wall-tones/economy.ts', import.meta.url), 'utf8');
let js = ts.transpileModule(src, { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
if (js.includes("'./cypher-progress.js'")) {
  const cypherProgressSrc = readFileSync(
    new URL('../../src/wall-tones/cypher-progress.ts', import.meta.url),
    'utf8',
  );
  const cypherKey = cypherProgressSrc.match(/export const CYPHER_PROGRESS_KEY = '([^']+)'/);
  assert.ok(cypherKey, 'cypher-progress.ts missing CYPHER_PROGRESS_KEY export');
  js = js.replace(
    /^import \{ CYPHER_PROGRESS_KEY \} from '\.\/cypher-progress\.js';$/m,
    `const CYPHER_PROGRESS_KEY = '${cypherKey[1]}';`,
  );
}
if (js.includes("'./cypher-background.js'")) {
  const backgroundSrc = readFileSync(
    new URL('../../src/wall-tones/cypher-background.ts', import.meta.url),
    'utf8',
  );
  const backgroundKey = backgroundSrc.match(/export const BACKGROUND_PROGRESS_KEY = '([^']+)'/);
  assert.ok(backgroundKey, 'cypher-background.ts missing BACKGROUND_PROGRESS_KEY export');
  js = js.replace(
    /^import \{ BACKGROUND_PROGRESS_KEY \} from '\.\/cypher-background\.js';$/m,
    `const BACKGROUND_PROGRESS_KEY = '${backgroundKey[1]}';`,
  );
}
if (js.includes("'./movement.js'")) {
  const movementSrc = readFileSync(
    new URL('../../src/wall-tones/movement.ts', import.meta.url),
    'utf8',
  );
  const movementJs = ts.transpileModule(movementSrc, { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
  const movementUrl = 'data:text/javascript;base64,' + Buffer.from(movementJs).toString('base64');
  js = js.replace("'./movement.js'", JSON.stringify(movementUrl));
}
const {
  WallTonesEconomy,
  SPEED_MAX_LEVEL,
  SPEED_COSTS,
} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function ecoWith(bars) {
  const eco = new WallTonesEconomy();
  eco.debugGrant(bars);
  return eco;
}

test('speed: provisional ladder 1000/2000/4000/8000, four levels, no unlock gate', () => {
  assert.equal(SPEED_MAX_LEVEL, 4);
  assert.deepEqual([...SPEED_COSTS], [1000, 2000, 4000, 8000]);
  const eco = ecoWith(0);
  assert.equal(eco.getSpeedLevel(), 0);
  assert.equal(eco.buyNextSpeedLevel(), false, 'refused without Bars');
  eco.debugGrant(1000);
  assert.equal(eco.buyNextSpeedLevel(), true);
  assert.equal(eco.getSpeedLevel(), 1);
  assert.equal(eco.getBars(), 0);
  eco.debugGrant(20000);
  assert.equal(eco.buyNextSpeedLevel(), true);
  assert.equal(eco.buyNextSpeedLevel(), true);
  assert.equal(eco.buyNextSpeedLevel(), true);
  assert.equal(eco.getSpeedLevel(), 4);
  assert.equal(eco.buyNextSpeedLevel(), false, 'refused past the top level');
  // 20000 - 2000 - 4000 - 8000 = 6000
  assert.equal(eco.getBars(), 6000);
});

test('speed: note-time factor halves per level; the toggle restores normal time', () => {
  const eco = ecoWith(0);
  assert.equal(eco.speedNoteTimeFactor(), 1, 'unowned plays at normal time');
  assert.equal(eco.isSpeedEnabled(), false);
  eco.debugGrantSpeedLevel(1);
  assert.equal(eco.isSpeedEnabled(), true, 'owning keeps it on');
  assert.equal(eco.speedNoteTimeFactor(), 0.5);
  eco.debugGrantSpeedLevel(2);
  assert.equal(eco.speedNoteTimeFactor(), 0.25);
  eco.debugGrantSpeedLevel(4);
  assert.equal(eco.speedNoteTimeFactor(), 0.0625);
  eco.debugGrantSpeedLevel(9);
  assert.equal(eco.getSpeedLevel(), SPEED_MAX_LEVEL, 'grant clamps at the top level');
  eco.setSpeedDisabled(true);
  assert.equal(eco.isSpeedEnabled(), false);
  assert.equal(eco.speedNoteTimeFactor(), 1, 'disabled plays at normal time');
  eco.setSpeedDisabled(false);
  assert.equal(eco.isSpeedEnabled(), true);
});

test('speed: coverage is the higher of the Play/Autoplay note counts (his rule)', () => {
  const eco = ecoWith(0);
  assert.equal(eco.speedCoveredNoteCount(), 0, 'nothing covered without Play/Autoplay');
  eco.debugGrantPlayLevel(1); // 5 notes
  assert.equal(eco.speedCoveredNoteCount(), 5);
  eco.debugGrantPlayLevel(2); // 10 notes
  assert.equal(eco.speedCoveredNoteCount(), 10);
  // Autoplay needs Play L4 + Listen; grant Play 4 and buy Listen to own it.
  eco.debugGrantPlayLevel(4);
  assert.equal(eco.buyListen(), false, 'no Bars left');
  eco.debugGrant(10000);
  assert.equal(eco.buyListen(), true);
  assert.equal(eco.buyNextAutoplayLevel(), true);
  assert.equal(eco.getAutoplayNoteCount(), 5);
  assert.equal(eco.speedCoveredNoteCount(), 20, 'Play 20 notes outranks Autoplay 5');
});
