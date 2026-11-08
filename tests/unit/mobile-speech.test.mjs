import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Run the production speech module with a strict, element-scoped Safari media
// policy. This tests routing/gesture timing, not physical iOS audio output.
async function loadSpeech({ rejectFirst = false, subtitles = false } = {}) {
  const elements = [];
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
    document: { baseURI: 'https://example.test/pr-preview/pr-22/',
      body: {appendChild: element => elements.push(element)},
      createElement: () => ({style: {}, setAttribute() {}, remove() { this.removed = true; }}),
    },
    window: { setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; } },
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'iPhone', maxTouchPoints: 5 }, configurable: true });
  globalThis.__audioStub = {
    ensureAudioRunning: () => { decodeCalls++; return new Promise(() => {}); },
    primeWallTonesAudioFromGesture: () => { primeCalls++; },
    needsExplicitMobileSoundUnlock: () => true,
  };
  globalThis.__subtitles = subtitles;
  globalThis.__voicesOff = false;
  globalThis.__captions = [];
  let source = readFileSync(new URL('../../src/wall-tones/speech.ts', import.meta.url), 'utf8');
  source = source.replace(/^import .* from '.\/audio.js';/m,
    'const {ensureAudioRunning, primeWallTonesAudioFromGesture, needsExplicitMobileSoundUnlock} = globalThis.__audioStub;');
  // Only non-routing dependencies are replaced. The production mobile element
  // and gesture/queue/cancellation implementation below remains under test.
  source = source.replace(/^import .* from '.\/clip-transcripts.js';/m,
    "const CLIP_TRANSCRIPTS = new Proxy({}, {get: (_target, id) => String(id)});");
  source = source.replace(/^import .* from '.\/accessibility.js';/m,
    'const startSpokenCaption = (t) => { globalThis.__captions.push(t); return 1; }; const endSpokenCaption = () => { globalThis.__captions.push(""); }; const hearingSubtitlesEnabled = () => globalThis.__subtitles; const voicesOffEnabled = () => !!globalThis.__voicesOff;');
  source = source.replace(/^import .* from '.\/new-best-(male|female).js';/gm, '');
  source = 'const NEW_BEST_MALE = {}; const NEW_BEST_FEMALE = {};\n' + source;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const speech = await import('data:text/javascript;base64,' + Buffer.from(js + '\n//' + Math.random()).toString('base64'));
  return { speech, instances, elements, gesture(fn) { gesture = true; try { return fn(); } finally { gesture = false; } }, get decodeCalls() { return decodeCalls; }, get primeCalls() { return primeCalls; } };
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
  const welcome = voice.speakAsync('welcome', true);
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


test('a separate settings welcome preview plays selected voice instead of consuming startup token', async () => {
  const h = await loadSpeech();
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture();
  h.instances[0].end();
  h.speech.setVoiceGender('female');
  const preview = new h.speech.WallTonesSpeech().speakAsync('welcome');
  await Promise.resolve();
  assert.equal(h.instances[0].played.length, 2);
  assert.match(h.instances[0].played[1], /female\/welcome.mp3$/);
  h.instances[0].end();
  await preview;
});

// No WallTonesSystem exists here: the first caption must still be readable.
test('opted-in native welcome renders its own caption before world startup', async () => {
  const h = await loadSpeech({subtitles: true});
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.instances[0].onplaying();
  assert.equal(h.elements[0].textContent, 'welcome');
  assert.equal(h.elements[0].id, 'wall-tones-startup-subtitle');
  h.instances[0].end();
  assert.equal(h.elements[0].removed, true);
});

// Voices off silences audio, not words (user, November 8): with subtitles on,
// speakAsync shows the caption for a reading beat and still paces the queue.
test('voices off + subtitles on shows captions without audio', async () => {
  const h = await loadSpeech({subtitles: true});
  globalThis.__voicesOff = true;
  const voice = new h.speech.WallTonesSpeech();
  const line = voice.speakAsync('welcome', false);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(globalThis.__captions, ['welcome'], 'caption text shown');
  assert.equal(voice.isBusy(), true, 'line still paces the queue');
  assert.equal(h.instances.length, 0, 'no audio element created');
  await line;
  assert.equal(voice.isBusy(), false);
  assert.deepEqual(globalThis.__captions, ['welcome', ''], 'caption cleared');
}, 15000);

test('voices off + subtitles off stays fully silent', async () => {
  const h = await loadSpeech({subtitles: false});
  globalThis.__voicesOff = true;
  const voice = new h.speech.WallTonesSpeech();
  await voice.speakAsync('welcome', false);
  assert.deepEqual(globalThis.__captions, []);
  assert.equal(h.instances.length, 0);
});
