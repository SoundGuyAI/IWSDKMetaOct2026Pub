import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Run the production speech module with a strict, element-scoped Safari media
// policy. This tests routing/gesture timing, not physical iOS audio output.
async function loadSpeech({ rejectFirst = false, subtitles = false } = {}) {
  const data = new Map();
  globalThis.localStorage = {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)};
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
  source = source.replace("import { LAB_INTRO_AUDIO } from '../lab-menu/intro-audio.js';", readFileSync(new URL('../../src/lab-menu/intro-audio.ts', import.meta.url), 'utf8'));
  // Inline real, dependency-free story modules in this data-URL test harness.
  for (const name of ['cypher-voice', 'cypher-script', 'cypher-background', 'instruction-memory', 'return-dialogue', 'first-note-help']) {
    const dependency = readFileSync(new URL(`../../src/wall-tones/${name}.ts`, import.meta.url), 'utf8');
    source = source.replace(new RegExp(`^import .* from './${name}\\.js';`, 'm'), '');
    source = dependency + '\n' + source;
  }
  source = source.replace(/^import .* from '.\/audio.js';/m,
    'const {ensureAudioRunning, primeWallTonesAudioFromGesture, needsExplicitMobileSoundUnlock} = globalThis.__audioStub;');
  // Only non-routing dependencies are replaced. The production mobile element
  // and gesture/queue/cancellation implementation below remains under test.
  source = source.replace(/^import .* from '.\/clip-transcripts.js';/m,
    readFileSync(new URL('../../src/wall-tones/clip-transcripts.ts', import.meta.url), 'utf8').replace(/^import type .*;\n/m, ''));
  source = source.replace(/^import .* from '.\/accessibility.js';/m,
    'const startSpokenCaption = (t) => { globalThis.__captions.push(t); return 1; }; const endSpokenCaption = () => { globalThis.__captions.push(""); }; const hearingSubtitlesEnabled = () => globalThis.__subtitles; const voicesOffEnabled = () => !!globalThis.__voicesOff;');
  source = source.replace(/^import .* from '.\/new-best-(male|female).js';/gm, '');
  source = source.replace(/^import .* from '.\/pick-combined-(male|female).js';/gm, '');
  source = source.replace(/^import .* from '.\/achv-intro-(male|female)-(pc|iphone|mr).js';/gm, '');
  source = 'const NEW_BEST_MALE = {}; const NEW_BEST_FEMALE = {}; const PICK_COMBINED_MALE = {}; const PICK_COMBINED_FEMALE = {}; const ACHV_INTRO_MALE_PC = {}; const ACHV_INTRO_MALE_IPHONE = {}; const ACHV_INTRO_MALE_MR = {}; const ACHV_INTRO_FEMALE_PC = {}; const ACHV_INTRO_FEMALE_IPHONE = {}; const ACHV_INTRO_FEMALE_MR = {};\n' + source;
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
  assert.equal(h.elements[0].textContent, 'Hello and welcome to Wall Tones, a musical memory game.');
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
  assert.deepEqual(globalThis.__captions, ['Hello and welcome to Wall Tones, a musical memory game.'], 'caption text shown');
  assert.equal(voice.isBusy(), true, 'line still paces the queue');
  assert.equal(h.instances.length, 0, 'no audio element created');
  await line;
  assert.equal(voice.isBusy(), false);
  assert.deepEqual(globalThis.__captions, ['Hello and welcome to Wall Tones, a musical memory game.', ''], 'caption cleared');
}, 15000);

test('voices off + subtitles off stays fully silent', async () => {
  const h = await loadSpeech({subtitles: false});
  globalThis.__voicesOff = true;
  const voice = new h.speech.WallTonesSpeech();
  await voice.speakAsync('welcome', false);
  assert.deepEqual(globalThis.__captions, []);
  assert.equal(h.instances.length, 0);
});


test('story lines keep their captured cast, share mobile element, caption verbatim and cancel cleanly', async () => {
  const h = await loadSpeech({subtitles: true});
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture();
  h.instances[0].end();
  h.speech.setVoiceGender('male');
  const voice = new h.speech.WallTonesSpeech();
  const cast = Object.freeze({narrator: 'male', cypher: 'female'});
  const first = voice.speakStoryLine('C01', cast);
  const narrator = voice.speakStoryLine('N01', cast);
  h.speech.setVoiceGender('female');
  await Promise.resolve();
  assert.match(h.instances[0].src, /audio\/story\/cypher\/female\/c01.mp3$/);
  h.instances[0].onplaying();
  assert.equal(globalThis.__captions.at(-1), 'Cypher: Connection... established.');
  h.instances[0].end();
  await first;
  await Promise.resolve(); await Promise.resolve();
  assert.match(h.instances[0].src, /audio\/story\/narrator\/male\/n01.mp3$/);
  voice.cancel();
  await narrator;
  assert.equal(voice.isBusy(), false);
  assert.equal(h.instances.length, 1);
  assert.equal(h.decodeCalls, 0);
});

test('story muted with subtitles shares caption pacing and skip cancellation', async () => {
  const h = await loadSpeech({subtitles: true});
  globalThis.__voicesOff = true;
  const voice = new h.speech.WallTonesSpeech();
  const line = voice.speakStoryLine('C01');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(globalThis.__captions.at(-1), 'Cypher: Connection... established.');
  assert.equal(voice.isBusy(), true);
  assert.equal(h.instances.length, 0);
  voice.cancel();
  await line;
  assert.equal(voice.isBusy(), false);
});

test('background lines use captured opposite cast and shared caption/Skip routing', async () => {
  const h = await loadSpeech({subtitles: true});
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture(); h.instances[0].end();
  const voice = new h.speech.WallTonesSpeech();
  const cast = Object.freeze({narrator:'female',cypher:'male'});
  const line = voice.speakBackgroundLine('R25',cast);
  h.speech.setVoiceGender('male'); await Promise.resolve();
  assert.match(h.instances[0].src,/audio\/story\/background\/male\/r25.mp3$/);
  h.instances[0].onplaying();
  assert.match(globalThis.__captions.at(-1),/His name was Houston/);
  voice.cancel(); await line; assert.equal(voice.isBusy(),false);
  assert.equal(h.instances.length,1);
});

test('story progress fires at actual element playback start once, not enqueue or completion', async () => {
  const h = await loadSpeech();
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture();
  const voice = new h.speech.WallTonesSpeech();
  let started = 0;
  const line = voice.speakStoryLine('C01', undefined, () => started++);
  assert.equal(started, 0, 'queueing is not hearing');
  await Promise.resolve();
  assert.equal(started, 0, 'calling play is not proof of playback');
  h.instances[0].onplaying();
  assert.equal(started, 1);
  h.instances[0].onplaying();
  assert.equal(started, 1, 'a resumed media event must not consume another line');
  voice.cancel();
  await line;
  assert.equal(started, 1, 'Skip neither rewinds nor double-counts');
});

test('cancel before playback and queued story cancellation do not mark unheard lines', async () => {
  const h = await loadSpeech();
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture();
  const voice = new h.speech.WallTonesSpeech();
  let started = 0;
  const first = voice.speakBackgroundLine('R01', { cypher: 'female', narrator: 'male' }, () => started++);
  const queued = voice.speakStoryLine('C02', undefined, () => started++);
  await Promise.resolve();
  const stalePlaying = h.instances[0].onplaying;
  voice.cancel();
  stalePlaying();
  await Promise.all([first, queued]);
  assert.equal(started, 0);
});

test('caption-only story starts consume the displayed line; silent mode retains progression', async () => {
  const h = await loadSpeech({ subtitles: true });
  globalThis.__voicesOff = true;
  const voice = new h.speech.WallTonesSpeech();
  let started = 0;
  const line = voice.speakStoryLine('N01', undefined, () => started++);
  await Promise.resolve();
  assert.equal(started, 1, 'story narrator follows the same start contract');
  voice.cancel();
  await line;
  globalThis.__subtitles = false;
  await voice.speakBackgroundLine('R01', { cypher: 'female', narrator: 'male' }, () => started++);
  assert.equal(started, 2, 'voices-off without captions must not strand the storyline');
});


test('Web Audio start consumes a story line; failed source start does not', async () => {
  const h = await loadSpeech();
  const voice = new h.speech.WallTonesSpeech();
  let started = 0;
  const clip = { url: 'https://example.test/story.mp3', text: 'Story', onStarted() { started++; } };
  const source = { connect() {}, start() {}, stop() {} };
  const context = { destination: {}, createBufferSource() { return source; } };
  const playing = voice.playBuffer(context, { duration: 1 }, clip);
  assert.equal(started, 1);
  source.onended();
  await playing;
  assert.equal(started, 1);
  source.start = () => { throw new Error('failed start'); };
  await voice.playBuffer(context, { duration: 1 }, clip);
  assert.equal(started, 1);
});

test('Lab lines keep captured opposite cast, exact captions and mobile cancellation', async () => {
  const h = await loadSpeech({subtitles: true});
  await h.gesture(() => h.speech.startMobileWelcomeFromGesture());
  h.speech.unlockSpeechFromGesture(); h.instances[0].end();
  const speech = new h.speech.WallTonesSpeech();
  const cast = {narrator: 'female', cypher: 'male'};
  const narrator = speech.speakLabLine('narrator', cast);
  const cypher = speech.speakLabLine('cypher', cast);
  await Promise.resolve(); await Promise.resolve();
  assert.match(h.instances[0].src, /^data:audio\/mpeg;base64,/);
  h.instances[0].onplaying();
  assert.equal(globalThis.__captions.at(-1), 'Narrator: Welcome to the Lab. These are features that will be added to the game. For now, you can try them here as demos.');
  h.instances[0].end(); await narrator;
  await Promise.resolve(); await Promise.resolve();
  h.instances[0].onplaying();
  assert.equal(globalThis.__captions.at(-1), "Cypher: Hands. Heads. Voices. Funny how many ways a machine can learn to listen. Keep trying them. I'll be listening too.");
  speech.cancel(); await cypher;
  assert.equal(speech.isBusy(), false);
  assert.equal(h.instances.length, 1);
});

test('completed tutorials stay silent across speech instances; section reset re-enables only that section', async () => {
 const h=await loadSpeech();
 await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.instances[0].end();h.speech.unlockSpeechFromGesture();
 let voice=new h.speech.WallTonesSpeech();
 const first=voice.speakAsync('howToPlayRest');await Promise.resolve();h.instances[0].end();await first;
 const count=h.instances[0].played.length;
 voice=new h.speech.WallTonesSpeech();await voice.speakAsync('howToPlayRest');assert.equal(h.instances[0].played.length,count);
 voice.resetInstructionSection('store');await voice.speakAsync('howToPlayRest');assert.equal(h.instances[0].played.length,count);
 voice.resetInstructionSection('gameplay');const replay=voice.speakAsync('howToPlayRest');await Promise.resolve();assert.equal(h.instances[0].played.length,count+1);h.instances[0].end();await replay;
});
test('cancel, media error and muted captions do not record a tutorial as heard', async () => {
 const h=await loadSpeech({subtitles:true});await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.instances[0].end();h.speech.unlockSpeechFromGesture();
 const voice=new h.speech.WallTonesSpeech();let run=voice.speakAsync('storeItemHint');await Promise.resolve();voice.cancel();await run;
 let saved=JSON.parse(localStorage.getItem('wall-tones-instructions-v1')??'null');assert.equal(saved,null);
 run=voice.speakAsync('storeItemHint');await Promise.resolve();h.instances[0].onerror();await run;h.instances[0].end();
 assert.equal(localStorage.getItem('wall-tones-instructions-v1'),null);
 globalThis.__voicesOff=true;run=voice.speakAsync('storeItemHint');await Promise.resolve();voice.cancel();await run;
 assert.equal(localStorage.getItem('wall-tones-instructions-v1'),null);
 globalThis.__voicesOff=false;run=voice.speakAsync('storeItemHint');await Promise.resolve();h.instances[0].end();await run;
 saved=JSON.parse(localStorage.getItem('wall-tones-instructions-v1'));assert.deepEqual(saved.heard,['storeItemHint']);
});

test('explicit reminder replays once without clearing heard status; ordinary subsequent playback stays suppressed', async () => {
 const h=await loadSpeech();await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.instances[0].end();h.speech.unlockSpeechFromGesture();
 const voice=new h.speech.WallTonesSpeech();let run=voice.speakAsync('storeIntro');await Promise.resolve();h.instances[0].end();await run;
 const saved=localStorage.getItem('wall-tones-instructions-v1'), count=h.instances[0].played.length;
 run=voice.replayInstruction('storeIntro');await Promise.resolve();assert.equal(h.instances[0].played.length,count+1);h.instances[0].end();await run;
 assert.equal(localStorage.getItem('wall-tones-instructions-v1'),saved);assert.equal(voice.hasHeardInstruction('storeIntro'),true);await voice.speakAsync('storeIntro');assert.equal(h.instances[0].played.length,count+1);
});

test('mobile trusted Start uses reviewed returning welcome and queue consumes it without duplicate',async()=>{
 const h=await loadSpeech();localStorage.setItem('wall-tones-return-visit-v1','1');await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.speech.unlockSpeechFromGesture();assert.match(h.instances[0].src,/return-reminders\/narrator\/male\/n-r01.mp3$/);
 const voice=new h.speech.WallTonesSpeech();const run=voice.speakReturnLine('N-R01');await Promise.resolve();h.instances[0].end();await run;assert.equal(h.instances[0].played.length,1);
});

test('opening transition remains eligible after Skip, completes once, and keeps its exact caption',async()=>{
 const h=await loadSpeech({subtitles:true});await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.instances[0].end();h.speech.unlockSpeechFromGesture();
 let voice=new h.speech.WallTonesSpeech();let run=voice.speakAsync('openingPattern');await Promise.resolve();h.instances[0].onplaying();
 assert.equal(globalThis.__captions.at(-1),"That opening pattern was your signal that the game is about to start. Now it's time to play.");
 voice.cancel();await run;assert.equal(voice.hasHeardInstruction('openingPattern'),false);
 run=voice.speakAsync('openingPattern');await Promise.resolve();h.instances[0].end();await run;
 assert.equal(voice.hasHeardInstruction('openingPattern'),true);assert.equal(voice.hasHeardInstruction('howToPlayRest'),false);
 const count=h.instances[0].played.length;voice=new h.speech.WallTonesSpeech();await voice.speakAsync('openingPattern');assert.equal(h.instances[0].played.length,count);
});

test('first-note feedback captures narrator, remains repeatable, captions exact words and cancels with the ordinary queue',async()=>{
 const h=await loadSpeech({subtitles:true});await h.gesture(()=>h.speech.startMobileWelcomeFromGesture());h.speech.unlockSpeechFromGesture();h.instances[0].end();
 const voice=new h.speech.WallTonesSpeech();h.speech.setVoiceGender('female');
 const cue=voice.speakFirstNoteHelp('press-blue','male');await Promise.resolve();await Promise.resolve();
 assert.match(h.instances[0].src,/first-note-help\/male\/press-blue.mp3$/);h.instances[0].onplaying();assert.ok(globalThis.__captions.includes('Press blue.'));h.instances[0].end();await cue;
 const again=voice.speakFirstNoteHelp('press-blue','male');await Promise.resolve();await Promise.resolve();assert.equal(voice.isBusy(),true);voice.cancel();await again;assert.equal(voice.isBusy(),false);
 assert.equal(voice.hasHeardInstruction('howToPlayRest'),false);
 globalThis.__voicesOff=true;globalThis.__subtitles=false;await voice.speakFirstNoteHelp('guidance','female');assert.equal(voice.isBusy(),false);
});
