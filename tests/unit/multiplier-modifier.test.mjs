import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Backlog 97/70 (Multiplier x2): source wiring + economy behavior. The
// module loading mirrors store-tree-values.test.mjs: transpile economy.ts
// and inline/point its relative imports at data URLs.
const ui = readFileSync(
  new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url),
  'utf8',
);
const sys = readFileSync(
  new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url),
  'utf8',
);

test('multiplier wiring: control-row slash/label, handler, store and award hooks exist', () => {
  for (const id of ['id="control-multiplier-slash"', 'id="control-multiplier-label"']) {
    assert.ok(ui.includes(id), `uikitml missing ${id}`);
  }
  for (const snippet of [
    'onMultiplierControl',
    'buyNextMultiplierLevel',
    'MULTIPLIER_MAX_LEVEL',
    "case 'multiplier'",
    'pressMultiplierControl',
    'grantMultiplierLevel',
    'engaged',
    'Multiplier disengaged',
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
  MULTIPLIER_MAX_LEVEL,
  MULTIPLIER_COSTS,
} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function ecoWith(bars) {
  const eco = new WallTonesEconomy();
  eco.debugGrant(bars);
  return eco;
}

test('multiplier: proposed ladder X2 1000 / X3 5000 / X4 25000 (x5 growth), three levels, no gate', () => {
  assert.equal(MULTIPLIER_MAX_LEVEL, 3);
  assert.deepEqual([...MULTIPLIER_COSTS], [1000, 5000, 25000]);
  const eco = ecoWith(0);
  assert.equal(eco.getMultiplierLevel(), 0);
  assert.equal(eco.buyNextMultiplierLevel(), false, 'refused without Bars');
  eco.debugGrant(1000);
  assert.equal(eco.buyNextMultiplierLevel(), true);
  assert.equal(eco.getMultiplierLevel(), 1);
  assert.equal(eco.getBars(), 0);
  eco.debugGrant(40000);
  assert.equal(eco.buyNextMultiplierLevel(), true);
  assert.equal(eco.buyNextMultiplierLevel(), true);
  assert.equal(eco.getMultiplierLevel(), 3);
  assert.equal(eco.buyNextMultiplierLevel(), false, 'refused past the top level');
  // 40000 - 5000 - 25000 = 10000
  assert.equal(eco.getBars(), 10000);
});

test('multiplier: factor is level+1 while enabled, 1 while off; toggle mirrors AutoPlay', () => {
  const eco = ecoWith(0);
  assert.equal(eco.getMultiplierFactor(), 1, 'unowned earns normal');
  assert.equal(eco.isMultiplierEnabled(), false);
  eco.debugGrantMultiplierLevel(1);
  assert.equal(eco.isMultiplierEnabled(), true, 'owning keeps it on');
  assert.equal(eco.getMultiplierFactor(), 2);
  eco.debugGrantMultiplierLevel(3);
  assert.equal(eco.getMultiplierFactor(), 4);
  eco.debugGrantMultiplierLevel(9);
  assert.equal(eco.getMultiplierLevel(), MULTIPLIER_MAX_LEVEL, 'grant clamps at the top level');
  eco.setMultiplierDisabled(true);
  assert.equal(eco.isMultiplierEnabled(), false);
  assert.equal(eco.getMultiplierFactor(), 1, 'disabled earns normal');
});

test('multiplier: the owned tier drives the payout - X3 and X4 scale awards by 3 and 4, not just X2', () => {
  const eco = ecoWith(0);
  eco.debugGrantMultiplierLevel(2); // X3
  assert.equal(eco.getMultiplierFactor(), 3);
  assert.equal(eco.awardForPress(1), 3, 'press Bars triple at X3');
  const round3 = eco.completePattern(5, false);
  assert.deepEqual(round3, { completion: 3, bonus: 0 }, 'completion triples at X3');
  eco.debugGrantMultiplierLevel(3); // X4
  assert.equal(eco.getMultiplierFactor(), 4);
  assert.equal(eco.awardForPress(1), 4, 'press Bars quadruple at X4');
  const round4 = eco.completePattern(5, true);
  assert.deepEqual(round4, { completion: 4, bonus: 20 }, 'completion 1x4 and bonus (rate x streak 5)x4 at X4');
});

test('multiplier: every Bar award scales - presses, completion and record bonus', () => {
  const eco = ecoWith(0);
  eco.debugGrantMultiplierLevel(1); // X2
  assert.equal(eco.awardForPress(1), 2, 'press Bars double');
  const round = eco.completePattern(5, true);
  // band rate at streak 5 is 1: completion 1x2 = 2, bonus (rate x streak) 5x2 = 10
  assert.deepEqual(round, { completion: 2, bonus: 10 });
  assert.equal(eco.getBarsTotal(), 14, 'multiplied Bars count toward lifetime totals');
  eco.setMultiplierDisabled(true);
  assert.equal(eco.awardForPress(6), 1, 'flat 1 Bar per press, unmultiplied while off');
});
