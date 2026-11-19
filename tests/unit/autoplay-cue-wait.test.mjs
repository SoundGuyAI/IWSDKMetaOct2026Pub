import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// AutoPlay cue drain tracking (owner 2026-11-19): the narration queue waits
// on waitForAutoplayCuesToFinish so narrator/Cypher lines never play on top
// of the robot's pattern line. The autoplay-cue payload is stubbed; the
// production tracking in audio.ts is under test.
async function loadAudio() {
  const sources = [];
  class FakeSource {
    constructor() { this.onended = null; this.buffer = null; sources.push(this); }
    connect(node) { return node; }
    start() { this.started = true; }
  }
  class FakeGain {
    constructor() { this.gain = { value: 0 }; }
    connect(node) { return node; }
  }
  class FakeContext {
    constructor() { this.state = 'running'; this.destination = {}; }
    createBufferSource() { return new FakeSource(); }
    createGain() { return new FakeGain(); }
    decodeAudioData() { return Promise.resolve({ duration: 0.05 }); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  Object.assign(globalThis, { AudioContext: FakeContext });
  const constants = readFileSync(new URL('../../src/wall-tones/constants.ts', import.meta.url), 'utf8');
  let source = readFileSync(new URL('../../src/wall-tones/audio.ts', import.meta.url), 'utf8');
  source = source.replace(/^import \{ WALL_TONE_PADS, NOTE_DURATION_S \} from '.\/constants\.js';\n/m, constants + '\n');
  source = source.replace(/^import \{[^}]*\} from '.\/autoplay-cue\.js';\n/m,
    "const AUTOPLAY_CHIRP_MP3_BASE64 = 'AAAA';\nconst AUTOPLAY_ENGAGED_MP3_BASE64 = 'AAAA';\nconst AUTOPLAY_DISENGAGED_MP3_BASE64 = 'AAAA';\nconst nextAutoplayPhraseBase64 = () => 'AAAA';\n");
  assert.ok(!source.includes("from './autoplay-cue.js'"), 'autoplay-cue import stubbed');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const audio = await import('data:text/javascript;base64,' + Buffer.from(js + '\n//' + Math.random()).toString('base64'));
  return { audio, sources };
}

const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

test('no cue playing: the drain resolves immediately', async () => {
  const { audio } = await loadAudio();
  assert.equal(audio.autoplayCuesActive(), false);
  let drained = false;
  await audio.waitForAutoplayCuesToFinish().then(() => { drained = true; });
  assert.equal(drained, true);
});

test('the drain stays pending while a round cue sounds and resolves at its end', async () => {
  const { audio, sources } = await loadAudio();
  await audio.playAutoplayRoundCue();
  assert.equal(sources.length, 2, 'chirp plus phrase started');
  assert.ok(sources.every(s => s.started));
  assert.equal(audio.autoplayCuesActive(), true);
  let drained = false;
  void audio.waitForAutoplayCuesToFinish().then(() => { drained = true; });
  await flush();
  assert.equal(drained, false, 'narration keeps waiting while the robot talks');
  sources[0].onended();
  await flush();
  assert.equal(drained, false, 'the phrase clip is still playing');
  sources[1].onended();
  await flush();
  assert.equal(drained, true, 'robot finished: narration may start');
  assert.equal(audio.autoplayCuesActive(), false);
});

test('a cue that fails to start never blocks the drain', async () => {
  const { audio, sources } = await loadAudio();
  globalThis.AudioContext = class extends globalThis.AudioContext {
    decodeAudioData() { return Promise.reject(new Error('bad clip')); }
  };
  await audio.playAutoplayEngagedCue();
  await flush();
  assert.equal(sources.length, 0);
  assert.equal(audio.autoplayCuesActive(), false);
  let drained = false;
  await audio.waitForAutoplayCuesToFinish().then(() => { drained = true; });
  assert.equal(drained, true);
});

test('the test hook releases waiters with in-flight cues', async () => {
  const { audio } = await loadAudio();
  await audio.playAutoplayRoundCue();
  let drained = false;
  void audio.waitForAutoplayCuesToFinish().then(() => { drained = true; });
  await flush();
  assert.equal(drained, false);
  audio.clearAutoplayCuesForTests();
  await flush();
  assert.equal(drained, true);
});
