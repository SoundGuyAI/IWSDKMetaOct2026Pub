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
const { cypherGenderForNarrator, captureCypherCast } = await load('cypher-voice');
const { CYPHER_ACT_ONE, findCypherLine } = await load('cypher-script');

test('each narrator gets the opposite Cypher cast', () => {
  assert.equal(cypherGenderForNarrator('male'), 'female');
  assert.equal(cypherGenderForNarrator('female'), 'male');
});

test('a communication window captures an immutable cast', () => {
  const first = captureCypherCast('male');
  const next = captureCypherCast('female');
  assert.deepEqual(first, { narrator: 'male', cypher: 'female' });
  assert.deepEqual(next, { narrator: 'female', cypher: 'male' });
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.cypher = 'male'; }, TypeError);
});

test('Act 1 contains precisely 19 Cypher and 7 narrator lines with unique IDs', () => {
  assert.equal(CYPHER_ACT_ONE.length, 26);
  assert.equal(new Set(CYPHER_ACT_ONE.map(line => line.id)).size, 26);
  assert.equal(CYPHER_ACT_ONE.filter(line => line.speaker === 'cypher').length, 19);
  assert.equal(CYPHER_ACT_ONE.filter(line => line.speaker === 'narrator').length, 7);
  for (const line of CYPHER_ACT_ONE) {
    assert.equal(line.speaker, line.id.startsWith('C') ? 'cypher' : 'narrator');
    assert.ok(line.text.trim());
    assert.equal(findCypherLine(line.id), line);
  }
});

test('opening and hidden-channel exposition preserve reviewed v0.2 words', () => {
  assert.equal(findCypherLine('C01').text, 'Connection... established.');
  assert.equal(findCypherLine('C04').text, 'Get a streak of ten or above, so I can send a longer message.');
  assert.equal(findCypherLine('C10').text, "One more thing. The game's AI can't hear me.");
  assert.match(findCypherLine('C11').text, /can't detect this channel/);
  assert.equal(findCypherLine('N01').text, 'Sorry about that. There seems to be a small glitch. Keep playing while I check it.');
});

const { CypherProgress, CYPHER_WINDOWS } = await load('cypher-progress');
test('first contact starts after five completed patterns and exchanges never bunch at one boundary', () => {
  const progress = new CypherProgress();
  assert.equal(progress.takeWindow(4), undefined);
  assert.equal(progress.takeWindow(5).id, 'connection');
  assert.equal(progress.completedWindows, 1);
  assert.equal(progress.takeWindow(6).id, 'next-window');
  assert.equal(progress.takeWindow(7).id, 'keep-playing');
  assert.equal(progress.takeWindow(8).id, 'ten');
  assert.equal(progress.takeWindow(9).id, 'first-fault');
  assert.equal(progress.takeWindow(9), undefined);
  assert.equal(progress.takeWindow(10).id, 'codename');
});

test('misses do not rewind dialogue; explicit spoken mission gates still apply', () => {
  const progress = new CypherProgress();
  for (let i = 0; i < 5; i++) progress.takeWindow(10);
  assert.equal(progress.takeWindow(1), undefined, 'codename needs current-run ten');
  assert.equal(progress.takeWindow(10).id, 'codename');
  for (let i = 0; i < 4; i++) progress.takeWindow(10);
  assert.equal(progress.takeWindow(14), undefined, 'seam needs the spoken fifteen mission');
  assert.equal(progress.takeWindow(15).id, 'seam');
  assert.equal(progress.takeWindow(16).id, 'seam-repaired');
  assert.equal(progress.takeWindow(17).id, 'longer-window');
  assert.equal(progress.takeWindow(18).id, 'last-check');
  assert.equal(progress.takeWindow(1024), undefined, 'Act 2/3 not invented');
  progress.reset();
  assert.equal(progress.takeWindow(4), undefined);
  assert.equal(progress.takeWindow(5).id, 'connection');
});

test('window sequence preserves every script line and separates narrator from the private channel', () => {
  assert.deepEqual(CYPHER_WINDOWS.flatMap(window => window.lines), CYPHER_ACT_ONE.map(line => line.id));
  for (const window of CYPHER_WINDOWS) {
    for (const id of window.lines) assert.equal(findCypherLine(id).speaker, window.speaker);
    if (window.speaker === 'narrator') assert.ok(window.fault || window.seam === 'closed');
  }
});


function storyStorage(initial) {
  let value = initial ?? null;
  return { getItem() { return value; }, setItem(_key, next) { value = next; } };
}
test('story position survives a new run and a reloaded instance without bypassing mission streaks', () => {
  const storage = storyStorage();
  const first = new CypherProgress(storage);
  for (let i = 0; i < 5; i++) first.takeWindow(10);
  const reloaded = new CypherProgress(storage);
  assert.equal(reloaded.completedWindows, 5);
  assert.equal(reloaded.takeWindow(1), undefined);
  assert.equal(reloaded.takeWindow(10).id, 'codename');
  assert.equal(new CypherProgress(storage).takeWindow(1).id, 'your-machine');
  assert.equal(new CypherProgress(storage).completedWindows, 7);
});
test('invalid, future-version and out-of-bounds story saves fail safely', () => {
  for (const value of ['broken', '{}', '{"version":2,"next":3}', '{"version":1,"next":999}', '{"version":1,"next":-1}', '{"version":1,"next":2.5}']) {
    assert.equal(new CypherProgress(storyStorage(value)).takeWindow(5).id, 'connection');
  }
});
test('unavailable storage does not block session play, and explicit story reset persists', () => {
  const failing = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
  const progress = new CypherProgress(failing);
  assert.equal(progress.takeWindow(5).id, 'connection');
  assert.equal(progress.takeWindow(6).id, 'next-window');
  const storage = storyStorage();
  const saved = new CypherProgress(storage);
  saved.takeWindow(5);
  saved.reset();
  assert.equal(new CypherProgress(storage).completedWindows, 0);
});


test('reload and skipped playback resume the first unfinished line losslessly', () => {
  const storage = storyStorage();
  const first = new CypherProgress(storage);
  for (let i = 0; i < 5; i++) first.takeWindow(10);
  assert.deepEqual(first.beginWindow(10).lines, ['C05', 'C06']);
  first.lineCompleted();
  const reloaded = new CypherProgress(storage);
  assert.deepEqual(reloaded.beginWindow(1).lines, ['C06']);
  assert.deepEqual(new CypherProgress(storage).beginWindow(1).lines, ['C06']);
  reloaded.lineCompleted();
  assert.equal(new CypherProgress(storage).beginWindow(1).id, 'your-machine');
});
