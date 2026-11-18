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

test('Act 1 contains precisely 26 Cypher and 7 narrator lines with unique IDs', () => {
  assert.equal(CYPHER_ACT_ONE.length, 33);
  assert.equal(new Set(CYPHER_ACT_ONE.map(line => line.id)).size, 33);
  assert.equal(CYPHER_ACT_ONE.filter(line => line.speaker === 'cypher').length, 26);
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
  assert.equal(progress.takeWindow(16), undefined, 'the streak-17 reason beat waits for seventeen');
  assert.equal(progress.takeWindow(17).id, 'rift-reason-17');
  assert.equal(progress.takeWindow(18).id, 'rift-reason-18');
  assert.equal(progress.takeWindow(19).id, 'longer-window');
  assert.equal(progress.takeWindow(20).id, 'last-check');
  assert.equal(progress.takeWindow(1024), undefined, 'Act 2/3 not invented');
  progress.reset();
  assert.equal(progress.takeWindow(4), undefined);
  assert.equal(progress.takeWindow(5).id, 'connection');
});

test('window sequence preserves every windowed script line and separates narrator from the private channel', () => {
  // C24 is the third-seal acknowledgement: the rift encounter plays it, no
  // window owns it (owner-settled Nov 18).
  const windowed = CYPHER_ACT_ONE.map(line => line.id).filter(id => id !== 'C24');
  assert.deepEqual(CYPHER_WINDOWS.flatMap(window => window.lines), windowed);
  assert.equal(findCypherLine('C24').speaker, 'cypher');
  assert.ok(CYPHER_WINDOWS.every(window => !window.lines.includes('C24')));
  for (const window of CYPHER_WINDOWS) {
    for (const id of window.lines) assert.equal(findCypherLine(id).speaker, window.speaker);
    if (window.speaker === 'narrator') assert.ok(window.fault || window.seam === 'closed');
  }
});

test('rift encounter beats keep the owner-approved words and gates', () => {
  assert.equal(findCypherLine('C16A').text, 'That light is a portal. The link is tearing them open.');
  assert.equal(findCypherLine('C16B').text, 'Your notes carry energy now. Aim it at a portal and hold to close it.');
  assert.equal(findCypherLine('C16C').text, "More will follow. Close them all - I'll hold the link.");
  assert.equal(findCypherLine('N04').text, "I'm sorry. I don't know what those lights were. My checks can't explain them.");
  assert.equal(findCypherLine('C20').text, "About those portals. That wasn't a glitch - their system is hunting.");
  assert.equal(findCypherLine('C21').text, "It's scanning for this link. The portals are how it tries to tear in.");
  assert.equal(findCypherLine('C22').text, 'If it finds this channel, it will destroy the link.');
  assert.equal(findCypherLine('C23').text, 'Every portal you close keeps us hidden a little longer.');
  assert.equal(findCypherLine('C24').text, "That's all three. The link is stable again. Thank you.");
  const byId = Object.fromEntries(CYPHER_WINDOWS.map(window => [window.id, window]));
  assert.deepEqual(byId['seam'].lines, ['C15', 'C16A', 'C16B', 'C16C']);
  assert.equal(byId['seam-repaired'].gate, undefined, 'the narrator apology reacts to open portals, ungated');
  assert.equal(byId['rift-reason-17'].gate, 'rift-sealed');
  assert.equal(byId['rift-reason-18'].gate, 'rift-sealed');
  assert.equal(byId['longer-window'].gate, 'rift-sealed');
  assert.equal(byId['last-check'].gate, 'rift-sealed');
});

test('peekWindow previews the next fresh window without consuming it', () => {
  const progress = new CypherProgress();
  for (let i = 0; i < 10; i++) progress.takeWindow(10);
  assert.equal(progress.peekWindow(14), undefined, 'mission streak still applies');
  assert.equal(progress.peekWindow(15)?.id, 'seam');
  assert.equal(progress.completedWindows, 10, 'peek consumed nothing');
  assert.equal(progress.takeWindow(15).id, 'seam');
  assert.equal(progress.peekWindow(15)?.id, 'seam-repaired');
  const resumed = new CypherProgress();
  for (let i = 0; i < 5; i++) resumed.takeWindow(10);
  resumed.beginWindow(10);
  assert.equal(resumed.peekWindow(20), undefined, 'an interrupted window hides the fresh peek');
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
