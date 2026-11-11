import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Combined mode must speak ONE prompt for what was found (user, November 11):
// a combined line when both kinds exist, the existing single-surface lines
// otherwise. The module has no runtime imports, so no stubs are needed.
const source = readFileSync(
  new URL('../../src/wall-tones/combined-pick-speech.ts', import.meta.url),
  'utf8',
).replace(/^import type .*$/m, '');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { combinedPickSpeechLines } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);

test('both walls and tables found speaks exactly one combined prompt', () => {
  assert.deepEqual(combinedPickSpeechLines(2, 1), ['pickCombinedSlots']);
  assert.deepEqual(combinedPickSpeechLines(1, 3), ['pickCombinedSlots']);
});

test('walls only keeps the existing walls line', () => {
  assert.deepEqual(combinedPickSpeechLines(3, 0), ['pickWallSlots']);
});

test('tables only keeps the existing tables line', () => {
  assert.deepEqual(combinedPickSpeechLines(0, 2), ['pickTableSlots']);
});

test('neither found speaks nothing (fallback path unchanged)', () => {
  assert.deepEqual(combinedPickSpeechLines(0, 0), []);
});
