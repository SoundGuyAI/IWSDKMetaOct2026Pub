import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

async function load(name) {
  const source = readFileSync(new URL(`../../src/wall-tones/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const { CYPHER_ENCOURAGEMENT, EncouragementCue } = await load('cypher-encourage');

test('four encouragement lines with the approved words and unique ids', () => {
  assert.equal(CYPHER_ENCOURAGEMENT.length, 4);
  assert.equal(new Set(CYPHER_ENCOURAGEMENT.map(line => line.id)).size, 4);
  assert.deepEqual(
    CYPHER_ENCOURAGEMENT.map(line => line.id),
    ['enc1', 'enc2', 'enc3', 'enc4'],
  );
  assert.equal(CYPHER_ENCOURAGEMENT[0].text, "Good. They don't suspect anything.");
  assert.equal(CYPHER_ENCOURAGEMENT[1].text, "Keep going. I'm still here.");
  assert.equal(CYPHER_ENCOURAGEMENT[2].text, "Steady. We're getting closer.");
  assert.equal(CYPHER_ENCOURAGEMENT[3].text, "That's it. Keep the rhythm.");
});

test('no line before first Cypher contact or after Act 1 finishes', () => {
  const cue = new EncouragementCue(() => 0);
  for (let i = 0; i < 6; i += 1) {
    assert.equal(cue.successfulPattern(false, false, true), undefined);
    assert.equal(cue.successfulPattern(true, true, true), undefined);
  }
});

test('one line every two quiet successful patterns', () => {
  const cue = new EncouragementCue(() => 0);
  assert.equal(cue.successfulPattern(true, false, true), undefined);
  const line = cue.successfulPattern(true, false, true);
  assert.ok(line);
  cue.lineCompleted();
  assert.equal(cue.successfulPattern(true, false, true), undefined);
  assert.ok(cue.successfulPattern(true, false, true));
});

test('a busy narrator holds the armed line until a quiet boundary', () => {
  const cue = new EncouragementCue(() => 0);
  assert.equal(cue.successfulPattern(true, false, true), undefined);
  assert.equal(cue.successfulPattern(true, false, false), undefined);
  assert.ok(cue.successfulPattern(true, false, true));
});

test('an unheard line retries instead of advancing', () => {
  const cue = new EncouragementCue(() => 0.4);
  cue.successfulPattern(true, false, true);
  const first = cue.successfulPattern(true, false, true);
  const retry = cue.successfulPattern(true, false, true);
  assert.equal(retry, first);
  cue.lineCompleted();
  cue.successfulPattern(true, false, true);
  const next = cue.successfulPattern(true, false, true);
  assert.ok(next);
  assert.notEqual(next.id, first.id);
});

test('the same line never plays twice in a row', () => {
  const cue = new EncouragementCue(() => 0.999);
  let previous;
  for (let i = 0; i < 8; i += 1) {
    cue.successfulPattern(true, false, true);
    const line = cue.successfulPattern(true, false, true);
    assert.ok(line);
    assert.notEqual(line.id, previous?.id);
    cue.lineCompleted();
    previous = line;
  }
});

const { CypherProgress } = await load('cypher-progress');

test('firstContactHeard is true only after the streak-5 window finishes', () => {
  const progress = new CypherProgress(undefined);
  assert.equal(progress.firstContactHeard, false);
  const window = progress.beginWindow(5);
  assert.equal(window.id, 'connection');
  assert.equal(progress.firstContactHeard, false);
  progress.lineCompleted();
  assert.equal(progress.firstContactHeard, true);
});
