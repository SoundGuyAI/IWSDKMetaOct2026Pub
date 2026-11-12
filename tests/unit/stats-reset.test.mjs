import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function source(name) {
  return readFileSync(new URL(`../../src/wall-tones/${name}.ts`, import.meta.url), 'utf8');
}
function moduleUrl(text) {
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const progressUrl = moduleUrl(source('cypher-progress'));
const { CYPHER_PROGRESS_KEY, CypherProgress } = await import(progressUrl);
// Resolve the one runtime dependency when loading source directly under node.
const economyJs = ts.transpileModule(source('economy'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace("'./cypher-progress.js'", JSON.stringify(progressUrl));
const { resetWallTonesStats } = await import('data:text/javascript;base64,' + Buffer.from(economyJs).toString('base64'));

test('settings stat reset clears economy and Cypher story but keeps preferences', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const keys = ['bars', 'bars-total', 'hint-level', 'achievements', 'first-flags', 'best-streak', 'purchases', 'presses', 'top-secret', 'savers'];
    for (const key of keys) storage.setItem('wall-tones-' + key, '123');
    storage.setItem('wall-tones-voice-gender', 'female');
    storage.setItem('wall-tones-hearing-subtitles', '1');
    const story = new CypherProgress(storage);
    story.beginWindow(5);
    story.lineCompleted();
    assert.equal(new CypherProgress(storage).completedWindows, 1);
    assert.ok(storage.getItem(CYPHER_PROGRESS_KEY));
    resetWallTonesStats();
    for (const key of keys) assert.equal(storage.getItem('wall-tones-' + key), null);
    assert.equal(storage.getItem(CYPHER_PROGRESS_KEY), null);
    assert.equal(new CypherProgress(storage).completedWindows, 0);
    assert.equal(new CypherProgress(storage).beginWindow(4), undefined);
    assert.equal(new CypherProgress(storage).beginWindow(5).lines[0], 'C01');
    assert.equal(storage.getItem('wall-tones-voice-gender'), 'female');
    assert.equal(storage.getItem('wall-tones-hearing-subtitles'), '1');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('settings stat reset tolerates restricted storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('restricted'); } });
  try { assert.doesNotThrow(resetWallTonesStats); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
