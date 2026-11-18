import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/wall-tones/sequence.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { WallTonesSequence } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function complete(game) {
  for (let i = 0; i < game.sequence.length; i += 1) game.onCorrectInput();
}

test('timing-fault reset starts a one-note pattern and keeps streak and best', () => {
  const g = new WallTonesSequence();
  g.startNewRun();
  for (let i = 0; i < 5; i += 1) complete(g);
  assert.equal(g.streak, 5);
  g.restartPatternKeepStreak();
  assert.equal(g.sequence.length, 1);
  assert.equal(g.inputStep, 0);
  assert.equal(g.streak, 5);
  assert.equal(g.bestStreak, 5);
});

test('after a reset the streak keeps counting from the kept value', () => {
  const g = new WallTonesSequence();
  g.startNewRun();
  for (let i = 0; i < 5; i += 1) complete(g);
  g.restartPatternKeepStreak();
  complete(g);
  assert.equal(g.streak, 6);
  complete(g);
  assert.equal(g.streak, 7);
  assert.equal(g.bestStreak, 7);
});

test('a wrong note after a reset still ends the run normally', () => {
  const g = new WallTonesSequence();
  g.startNewRun();
  for (let i = 0; i < 5; i += 1) complete(g);
  g.restartPatternKeepStreak();
  g.onWrongInput();
  assert.equal(g.streak, 0);
  assert.equal(g.sequence.length, 1);
  complete(g);
  assert.equal(g.streak, 1);
});
