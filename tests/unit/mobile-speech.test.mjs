import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Run the production speech module with a strict, element-scoped Safari media
// policy. This tests routing/gesture timing, not physical iOS audio output.
async function loadSpeech({ rejectFirst = false } = {}) {
  const instances = [];
  let gesture = false;
  let decodeCalls = 0;
  let primeCalls = 0;
  class Audio {
    constructor(src) { this.src = src; this.currentTime = 0; this.listeners = new Map(); instances.push(this); }
    load() {}
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    removeEventListener(type) { this.listeners.delete(type); }
    play() {
      if (rejectFirst) { rejectFirst = false; return Promise.reject(new Error('NotAllowedError')); }
      if (!this.allowed && !gesture) return Promise.reject(new Error('NotAllowedError'));
      this.allowed = true;
      this.played ??= [];
      this.played.push(this.src);
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    end() { this.listeners.get('ended')?.(); this.onended?.(); }
  }
  Object.assign(globalThis, {
    Audio,
    document: { baseURI: 'https://example.test/pr-preview/pr-22/' },
    window: { setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; } },
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'iPhone', maxTouchPoints: 5 }, configurable: true });
  globalThis.__audioStub = {
    ensureAudioRunning: () => { decodeCalls++; return new Promise(() => {}); },
    primeWallTonesAudioFromGesture: () => { primeCalls++; },
    needsExplicitMobileSoundUnlock: () => true,
  };
  let source = readFileSync(new URL('../../src/wall-tones/speech.ts', import.meta.url), 'utf8');
  source = source.replace(/^import .* from '.\/audio.js';/m,
    'const {ensureAudioRunning, primeWallTonesAudioFromGesture, needsExplicitMobileSoundUnlock} = globalThis.__audioStub;');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const speech = await import('data:text/javascript;base64,' + Buffer.from(js + '\n//' + Math.random()).toString('base64'));
  return { speech, instances, gesture(fn) { gesture = true; try { return fn(); } finally { gesture = false; } }, get decodeCalls() { return decodeCalls; }, get primeCalls() { return primeCalls; } };
}

test('Start plays welcome synchronously in gesture; entry consumes it without duplicate; later clips reuse unlocked element', async () => {
  const h = await loadSpeech();
  h.speech.prepareMobileWelcome();
  assert.equal(h.instances.length, 1);
  await h.gesture(() => {
    const started = h.speech.startMobileWelcomeFromGesture();
    h.speech.unlockSpeechFromGesture();
    assert.equal(h.instances[0].played.length, 1, 'actual welcome play called before gesture returns');
    return started;
  });
  const voice = new h.speech.WallTonesSpeech();
  const welcome = voice.speakAsync('welcome');
  await Promise.resolve();
  h.instances[0].end();
  await welcome;
  assert.equal(h.instances[0].played.length, 1, 'no replay when 3D menu enters');
  const next = voice.speakAsync('pointAndPress');
  await Promise.resolve();
  assert.match(h.instances[0].played[1], /point-and-press.mp3$/);
  h.instances[0].end();
  await next;
  assert.equal(h.instances.length, 1);
  assert.equal(h.decodeCalls, 0, 'mobile voice never waits on suspended Web Audio');
  assert.equal(h.primeCalls, 1);
});

test('rejected Start playback rejects to caller and can be retried with another gesture', async () => {
  const h = await loadSpeech({ rejectFirst: true });
  await assert.rejects(h.gesture(() => h.speech.startMobileWelcomeFromGesture()));
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  assert.equal(h.instances.length, 1);
  assert.equal(h.instances[0].played.length, 1);
});
