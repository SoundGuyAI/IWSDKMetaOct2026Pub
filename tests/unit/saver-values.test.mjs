import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../../src/wall-tones/consumable-values.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
const { saverUnitsForStreak, SAVER_PRICE_BARS, saverRetryPlan, gameOverRetryPresentation } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('saver units double every 10 streaks and keep doubling', () => {
  const at = [1, 10, 11, 20, 21, 31, 41, 50, 51, 61].map(saverUnitsForStreak);
  assert.deepEqual(at, [1, 1, 2, 2, 4, 8, 16, 16, 32, 64]);
  assert.equal(SAVER_PRICE_BARS, 18);
});

test('saverRetryPlan: one press buys the missing units and applies them', () => {
  // Enough held already: no purchase, just apply.
  assert.deepEqual(saverRetryPlan(2, 1, 100, 18), { buy: 0, costBars: 0, affordable: true, apply: true });
  // Classic case: none held, need 1 - buys exactly 1 for 18 and applies.
  assert.deepEqual(saverRetryPlan(0, 1, 18, 18), { buy: 1, costBars: 18, affordable: true, apply: true });
  // Higher streak: need 4, have 1 - one press buys the other 3 for 54 and applies.
  assert.deepEqual(saverRetryPlan(1, 4, 100, 18), { buy: 3, costBars: 54, affordable: true, apply: true });
  // Cannot afford the full retry: no partial purchase, no apply.
  assert.deepEqual(saverRetryPlan(0, 2, 18, 18), { buy: 0, costBars: 36, affordable: false, apply: false });
  assert.deepEqual(saverRetryPlan(1, 4, 53, 18), { buy: 0, costBars: 54, affordable: false, apply: false });
  // Degenerate: no retry needed.
  assert.deepEqual(saverRetryPlan(0, 0, 100, 18), { buy: 0, costBars: 0, affordable: false, apply: false });
});

test('gameOverRetryPresentation: one combined retry button (owner, Nov 17)', () => {
  // Enough owned savers: spend them, no purchase framing.
  assert.deepEqual(gameOverRetryPresentation(1, 1, 0), {
    text: 'Use 1 saver - retry same pattern',
    buying: false,
    affordable: true,
  });
  assert.deepEqual(gameOverRetryPresentation(4, 2, 0), {
    text: 'Use 2 savers - retry same pattern',
    buying: false,
    affordable: true,
  });
  // None owned: the same button buys exactly the missing savers and retries.
  assert.deepEqual(gameOverRetryPresentation(0, 1, 18), {
    text: 'Buy 1 saver & retry - 18',
    buying: true,
    affordable: true,
  });
  assert.deepEqual(gameOverRetryPresentation(1, 4, 60), {
    text: 'Buy 3 savers & retry - 54',
    buying: true,
    affordable: true,
  });
  // Not enough Bars: still the buy text (red in the panel), retry out of reach.
  assert.deepEqual(gameOverRetryPresentation(0, 1, 10), {
    text: 'Buy 1 saver & retry - 18',
    buying: true,
    affordable: false,
  });
});
