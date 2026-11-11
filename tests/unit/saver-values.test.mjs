import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../../src/wall-tones/consumable-values.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: 'esnext', target: 'es2022' } }).outputText;
const { saverUnitsForStreak, SAVER_PRICE_BARS } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('saver units double every 10 streaks and keep doubling', () => {
  const at = [1, 10, 11, 20, 21, 31, 41, 50, 51, 61].map(saverUnitsForStreak);
  assert.deepEqual(at, [1, 1, 2, 2, 4, 8, 16, 16, 32, 64]);
  assert.equal(SAVER_PRICE_BARS, 18);
});
