import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const ui = readFileSync(
  new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url),
  'utf8',
);
const sys = readFileSync(
  new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url),
  'utf8',
);

test('skill tree wiring: store popup ids, glyphs, gates and repeat label exist', () => {
  for (const id of [
    'id="store-heading"',
    'id="store-tree-list"',
    'id="store-detail-status"',
    'id="repeat-pattern-label"',
  ]) {
    assert.ok(ui.includes(id), `uikitml missing ${id}`);
  }
  for (const snippet of [
    'storeTileSrc',
    'selectStoreTile',
    'onBuySelected',
    'reconcileStore',
    'withDemoBarsFlag',
    'demoBars',
    'Locked: buy Listen first.',
    'reach Hint level',
    'replaysFree',
    'isReplayMilestone',
    'useReplay',
    'ui/bars-icon.png',
    "name: 'Hack'",
    "bodyText = 'Locked.'",
  ]) {
    assert.ok(sys.includes(snippet), `system missing ${snippet}`);
  }
});

const src = readFileSync(new URL('../../src/wall-tones/economy.ts', import.meta.url), 'utf8');
let js = ts.transpileModule(src, { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
// Combined-with-main trees (merge-ready CI) carry PR70's cypher-progress import in
// economy.ts; a data: URL module cannot resolve relative imports, so inline the
// constant read from source. The bare branch has neither the import nor the file.
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
  assert.ok(!js.includes('cypher-progress.js'), 'unresolved relative import left in transpiled economy');
}
const {
  WallTonesEconomy,
  LISTEN_COST,
  REPLAY_PRICE_BARS,
  REPLAY_FREE_CAP,
  AUTOPLAY_UNLOCK_HINT_LEVEL,
} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

/** Fresh economy with `bars` test-funded (in-memory; no localStorage in node). */
function ecoWith(bars) {
  const eco = new WallTonesEconomy();
  eco.debugGrant(bars);
  return eco;
}

test('approved test prices: Listen 30, Hint 25/50/100 then doubling, Autoplay 250 then doubling (provisional, Oded 2026-11-12), Replay 20', () => {
  assert.equal(LISTEN_COST, 30);
  assert.equal(REPLAY_PRICE_BARS, 20);
  const eco = ecoWith(0);
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => eco.hintCost(l)), [25, 50, 100, 200, 400]);
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => eco.autoplayCost(l)), [250, 500, 1000, 2000, 4000]);
});

test('gates: Hint L1 needs Listen, Autoplay needs Hint L4 (owner 2026-11-11)', () => {
  const eco = ecoWith(1000);
  assert.equal(eco.hintUnlocked(), false);
  assert.equal(eco.buyNextHintLevel(), false, 'hint refused before Listen');
  assert.equal(eco.buyListen(), true);
  assert.equal(eco.getBars(), 970);
  assert.equal(eco.buyListen(), false, 'Listen is one-time');
  assert.equal(eco.hintUnlocked(), true);
  assert.equal(eco.autoplayUnlocked(), false);
  assert.equal(eco.buyNextAutoplayLevel(), false, 'autoplay refused before Hint L4');
  for (let i = 0; i < 3; i++) assert.equal(eco.buyNextHintLevel(), true);
  assert.equal(eco.getHintLevel(), 3);
  assert.equal(eco.autoplayUnlocked(), false);
  assert.equal(eco.buyNextHintLevel(), true);
  assert.equal(eco.getHintLevel(), AUTOPLAY_UNLOCK_HINT_LEVEL);
  assert.equal(eco.autoplayUnlocked(), true);
  assert.equal(eco.buyNextAutoplayLevel(), true);
  assert.equal(eco.getAutoplayLevel(), 1);
  assert.equal(eco.getAutoplayNoteCount(), 5);
  // 1000 - 30 - 25 - 50 - 100 - 200 - 250 = 345
  assert.equal(eco.getBars(), 345);
});

test('legacy saves: hint levels without Listen reveal nothing and unlock no Autoplay (bug report 2026-11-12)', () => {
  // Pre-Listen stores on this origin wrote hint levels with no Listen
  // requirement; those saves must not act until Listen is owned, and the
  // bought levels themselves stay untouched (no clamping, no reset).
  const store = new Map([['wall-tones-hint-level', '4']]);
  const shim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  const prev = globalThis.localStorage;
  globalThis.localStorage = shim;
  try {
    const eco = new WallTonesEconomy();
    assert.equal(eco.getHintLevel(), 4, 'legacy levels load untouched');
    assert.equal(eco.ownsListen(), false);
    assert.equal(eco.getHintRevealCount(), 0, 'no reveal without Listen');
    assert.equal(eco.autoplayUnlocked(), false, 'no Autoplay without Listen');
    eco.debugGrant(30);
    assert.equal(eco.buyListen(), true);
    assert.equal(eco.getHintRevealCount(), 20, 'owned levels act again');
    assert.equal(eco.autoplayUnlocked(), true);
    assert.equal(eco.getHintLevel(), 4, 'levels never clamped');
  } finally {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  }
});

test('Replay inventory: 2 free cap, paid on top, grant at cap lost, free spent first', () => {
  const eco = ecoWith(100);
  assert.equal(REPLAY_FREE_CAP, 2);
  assert.equal(eco.grantFreeReplay(), true);
  assert.equal(eco.grantFreeReplay(), true);
  assert.equal(eco.grantFreeReplay(), false, 'grant at the full free cap is lost');
  assert.equal(eco.getReplaysFree(), 2);
  assert.equal(eco.buyReplay(), true, 'paid Replays sit on top of the cap');
  assert.equal(eco.getReplaysPaid(), 1);
  assert.equal(eco.getReplaysTotal(), 3);
  assert.equal(eco.getBars(), 80);
  assert.equal(eco.useReplay(), true);
  assert.equal(eco.useReplay(), true);
  assert.equal(eco.getReplaysFree(), 0, 'free ones are spent first');
  assert.equal(eco.getReplaysPaid(), 1);
  assert.equal(eco.useReplay(), true);
  assert.equal(eco.useReplay(), false, 'empty inventory refuses');
  // No purchase limit: two more buys land.
  assert.equal(eco.buyReplay(), true);
  assert.equal(eco.buyReplay(), true);
  assert.equal(eco.getReplaysPaid(), 2);
});

test('free Replay milestones: every 5 notes beyond the current Hint coverage', () => {
  const eco = ecoWith(500);
  // No Hint: coverage 0, milestones at 5, 10, 15...
  assert.equal(eco.isReplayMilestone(4), false);
  assert.equal(eco.isReplayMilestone(5), true);
  assert.equal(eco.isReplayMilestone(7), false);
  assert.equal(eco.isReplayMilestone(10), true);
  eco.buyListen();
  eco.buyNextHintLevel();
  eco.buyNextHintLevel(); // coverage 10
  assert.equal(eco.isReplayMilestone(10), false);
  assert.equal(eco.isReplayMilestone(14), false);
  assert.equal(eco.isReplayMilestone(15), true);
  assert.equal(eco.isReplayMilestone(20), true);
  assert.equal(eco.isReplayMilestone(23), false);
});

test('demoBars boost: spendable, spent first, never touches the real balance', () => {
  const eco = ecoWith(5);
  eco.applyDemoBoost(100);
  assert.equal(eco.getBars(), 105);
  assert.equal(eco.getBarsTotal(), 0, 'boost is not lifetime earnings');
  assert.equal(eco.buyListen(), true);
  assert.equal(eco.getBars(), 75);
  assert.equal(eco.getDemoBoost(), 70, 'boost spends before real Bars');
  eco.applyDemoBoost(0);
  assert.equal(eco.getDemoBoost(), 70);
  // Once the boost runs out, real Bars pay.
  eco.debugGrant(0);
  eco.applyDemoBoost(0);
  const eco2 = ecoWith(50);
  eco2.applyDemoBoost(10);
  assert.equal(eco2.buyReplay(), true); // 20: 10 boost + 10 real
  assert.equal(eco2.getBars(), 40);
  assert.equal(eco2.getDemoBoost(), 0);
});

test('demoBars boost: Saver buys through spend() like every other store item', () => {
  // Regression for PR #69: buySaver used to check/deduct this.bars only, so
  // Store Buy (affordable via getBars) and Game Over saverRetryPlan could
  // promise a Saver that then refused when only demo funds covered the cost.
  const saverPrice = 18;
  const eco = ecoWith(0);
  eco.applyDemoBoost(saverPrice);
  assert.equal(eco.getBars(), saverPrice);
  assert.equal(eco.buySaver(saverPrice), true);
  assert.equal(eco.getSavers(), 1);
  assert.equal(eco.getDemoBoost(), 0, 'boost covers the Saver fully');
  assert.equal(eco.getBars(), 0);
  // Mixed wallet: boost first, then persisted Bars.
  const eco2 = ecoWith(10);
  eco2.applyDemoBoost(10);
  assert.equal(eco2.buySaver(saverPrice), true); // 18: 10 boost + 8 real
  assert.equal(eco2.getSavers(), 1);
  assert.equal(eco2.getDemoBoost(), 0);
  assert.equal(eco2.getBars(), 2);
  assert.equal(eco2.buySaver(saverPrice), false, 'refuses when total wallet is short');
  assert.equal(eco2.getSavers(), 1);
});
