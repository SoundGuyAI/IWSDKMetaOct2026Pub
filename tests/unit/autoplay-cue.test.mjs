import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../../src/wall-tones/autoplay-cue.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');

const store = () => {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data };
};

const load = async (fakeStore) => {
  globalThis.localStorage = fakeStore;
  return import(moduleUrl + '#' + Math.random());
};

test('cue set: 15 regular phrases plus 4 gated weary lines, all valid mp3 base64', async () => {
  const m = await load(store());
  assert.equal(m.AUTOPLAY_PHRASE_MP3_BASE64S.length, 15);
  assert.equal(m.AUTOPLAY_MARVIN_MP3_BASE64S.length, 4);
  for (const b64 of [...m.AUTOPLAY_PHRASE_MP3_BASE64S, ...m.AUTOPLAY_MARVIN_MP3_BASE64S, m.AUTOPLAY_CHIRP_MP3_BASE64, m.AUTOPLAY_ENGAGED_MP3_BASE64, m.AUTOPLAY_DISENGAGED_MP3_BASE64]) {
    const bytes = Buffer.from(b64, 'base64');
    assert.ok(bytes.length > 1000);
    assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff, 'mp3 magic');
  }
  assert.equal(m.AUTOPLAY_PHRASES_HEARD_KEY, 'wall-tones-autoplay-phrases-heard-v1');
});

test('rotation plays every regular phrase in order before wrapping', async () => {
  const m = await load(store());
  m.resetAutoplayPhraseRotation();
  const first = Array.from({ length: 15 }, () => m.nextAutoplayPhraseBase64());
  assert.deepEqual(first, [...m.AUTOPLAY_PHRASE_MP3_BASE64S]);
  // All 15 are now heard, so the rotation has grown to include the weary
  // lines instead of wrapping back to the first regular phrase.
  assert.equal(m.nextAutoplayPhraseBase64(), m.AUTOPLAY_MARVIN_MP3_BASE64S[0]);
});

test('weary lines stay out of the rotation until every regular phrase was heard', async () => {
  const m = await load(store());
  m.resetAutoplayPhraseRotation();
  const before = Array.from({ length: 14 }, () => m.nextAutoplayPhraseBase64());
  assert.ok(before.every(p => m.AUTOPLAY_PHRASE_MP3_BASE64S.includes(p)));
  // 15 heard after one full pass; next cycle mixes in the weary lines.
  m.nextAutoplayPhraseBase64();
  const after = Array.from({ length: 19 }, () => m.nextAutoplayPhraseBase64());
  assert.deepEqual(after.slice(0, 4), [...m.AUTOPLAY_MARVIN_MP3_BASE64S]);
});

test('heard phrases persist across reloads and survive corrupt saves', async () => {
  const s = store();
  let m = await load(s);
  m.resetAutoplayPhraseRotation();
  for (let i = 0; i < 15; i++) m.nextAutoplayPhraseBase64();
  m = await load(s); // simulated reload: heard set re-read from storage
  // The in-memory cursor restarts on reload (existing behavior), so the
  // regular phrases rotate through again and the weary lines follow.
  assert.deepEqual(Array.from({ length: 19 }, () => m.nextAutoplayPhraseBase64()),
    [...m.AUTOPLAY_PHRASE_MP3_BASE64S, ...m.AUTOPLAY_MARVIN_MP3_BASE64S]);
  s.setItem(m.AUTOPLAY_PHRASES_HEARD_KEY, 'broken');
  m = await load(s);
  const again = Array.from({ length: 15 }, () => m.nextAutoplayPhraseBase64());
  assert.ok(again.every(p => m.AUTOPLAY_PHRASE_MP3_BASE64S.includes(p)));
});

test('reset hook forgets heard phrases and clears the saved record', async () => {
  const s = store();
  const m = await load(s);
  for (let i = 0; i < 15; i++) m.nextAutoplayPhraseBase64();
  assert.ok(s.getItem(m.AUTOPLAY_PHRASES_HEARD_KEY) != null);
  m.resetAutoplayPhraseRotation();
  assert.equal(s.getItem(m.AUTOPLAY_PHRASES_HEARD_KEY), null);
  assert.equal(m.nextAutoplayPhraseBase64(), m.AUTOPLAY_PHRASE_MP3_BASE64S[0]);
});
