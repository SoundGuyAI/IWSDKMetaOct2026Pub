import { CYPHER_BACKGROUND, type BackgroundLineId } from './cypher-background.js';
import { captureCypherCast, type CypherCast } from './cypher-voice.js';
import { findCypherLine, type CypherLineId } from './cypher-script.js';
import { CLIP_TRANSCRIPTS } from './clip-transcripts.js';
import { startSpokenCaption, endSpokenCaption, hearingSubtitlesEnabled, voicesOffEnabled } from './accessibility.js';
import { NEW_BEST_MALE } from './new-best-male.js';
import { NEW_BEST_FEMALE } from './new-best-female.js';
import { PICK_COMBINED_MALE } from './pick-combined-male.js';
import { PICK_COMBINED_FEMALE } from './pick-combined-female.js';
import { ACHV_INTRO_MALE_PC } from './achv-intro-male-pc.js';
import { ACHV_INTRO_MALE_IPHONE } from './achv-intro-male-iphone.js';
import { ACHV_INTRO_MALE_MR } from './achv-intro-male-mr.js';
import { ACHV_INTRO_FEMALE_PC } from './achv-intro-female-pc.js';
import { ACHV_INTRO_FEMALE_IPHONE } from './achv-intro-female-iphone.js';
import { ACHV_INTRO_FEMALE_MR } from './achv-intro-female-mr.js';
/**
 * Prerecorded voice lines for Wall Tones (English).
 *
 * Replaces the old browser speechSynthesis robot voice: every line is an
 * audio clip in public/audio/speech/, generated once and shipped with the
 * app. Playback shares the game's Web Audio unlock flow, so the iPhone /
 * Quest gesture rules stay identical to the pad tones.
 */

import { ensureAudioRunning, primeWallTonesAudioFromGesture, needsExplicitMobileSoundUnlock } from './audio.js';

export type WallTonesClipId =
  | 'welcome'
  | 'chooseMode'
  | 'howToPlay'
  | 'pointAndPress'
  | 'howToPlayRest'
  | 'newBest1'
  | 'newBest2'
  | 'newBest3'
  | 'barsFirstEarn'
  | 'storeWelcome'
  | 'storeHints'
  | 'cheer1'
  | 'cheer2'
  | 'cheer3'
  | 'cheer4'
  | 'cheer5'
  | 'cheer6'
  | 'milestone5'
  | 'milestone10'
  | 'milestone15'
  | 'milestone20'
  | 'hype1'
  | 'hype2'
  | 'hype3'
  | 'wrong1'
  | 'wrong2'
  | 'wrong3'
  | 'wrong4'
  | 'wrong5'
  | 'lookAround'
  | 'roomCapture'
  | 'pickWallSlots'
  | 'pickTableSlots'
  | 'pickCombinedSlots'
  | 'achvIntroPc'
  | 'achvIntroIphone'
  | 'achvIntroMr'
  | 'notEnoughWallSpace'
  | 'tableFound'
  | 'padsOnWalls'
  | 'noTable'
  | 'chooseAirMenu'
  | 'chooseAirOrient'
  | 'airPlace1'
  | 'airPlace2'
  | 'airPlace3'
  | 'airPlace4'
  | 'airPlaceShort2'
  | 'airPlaceShort3'
  | 'airPlaceShort4'
  | 'soundReady'
  | 'idleReplay'
  | 'repeatPattern'
  | 'backToMenu'
  | 'rescanRoom';

/** Clip files under public/audio/speech/. */
export const WALL_TONES_CLIP_FILES: Record<WallTonesClipId, string> = {
  welcome: 'welcome.mp3',
  chooseMode: 'choose-mode.mp3',
  howToPlay: 'how-to-play.mp3',
  pointAndPress: 'point-and-press.mp3',
  howToPlayRest: 'how-to-play-rest.mp3',
  newBest1: 'new-best-1.mp3',
  newBest2: 'new-best-2.mp3',
  newBest3: 'new-best-3.mp3',
  cheer1: 'cheer-1.mp3',
  cheer2: 'cheer-2.mp3',
  cheer3: 'cheer-3.mp3',
  cheer4: 'cheer-4.mp3',
  cheer5: 'cheer-5.mp3',
  cheer6: 'cheer-6.mp3',
  milestone5: 'milestone-5.mp3',
  milestone10: 'milestone-10.mp3',
  milestone15: 'milestone-15.mp3',
  milestone20: 'milestone-20.mp3',
  barsFirstEarn: 'bars-first-earn.mp3',
  storeWelcome: 'store-welcome.mp3',
  storeHints: 'store-hints.mp3',
  hype1: 'hype-1.mp3',
  hype2: 'hype-2.mp3',
  hype3: 'hype-3.mp3',
  wrong1: 'wrong-1.mp3',
  wrong2: 'wrong-2.mp3',
  wrong3: 'wrong-3.mp3',
  wrong4: 'wrong-4.mp3',
  wrong5: 'wrong-5.mp3',
  lookAround: 'look-around.mp3',
  roomCapture: 'room-capture.mp3',
  pickWallSlots: 'pick-wall-slots.mp3',
  pickTableSlots: 'pick-table-slots.mp3',
  pickCombinedSlots: 'pick-combined-slots.mp3',
  achvIntroPc: 'embedded-achv-intro-pc.mp3',
  achvIntroIphone: 'embedded-achv-intro-iphone.mp3',
  achvIntroMr: 'embedded-achv-intro-mr.mp3',
  notEnoughWallSpace: 'not-enough-wall-space.mp3',
  tableFound: 'table-found.mp3',
  padsOnWalls: 'pads-on-walls.mp3',
  noTable: 'no-table.mp3',
  chooseAirMenu: 'choose-air-menu.mp3',
  chooseAirOrient: 'choose-air-orient.mp3',
  airPlace1: 'air-place-1.mp3',
  airPlace2: 'air-place-2.mp3',
  airPlace3: 'air-place-3.mp3',
  airPlace4: 'air-place-4.mp3',
  airPlaceShort2: 'air-place-short-2.mp3',
  airPlaceShort3: 'air-place-short-3.mp3',
  airPlaceShort4: 'air-place-short-4.mp3',
  soundReady: 'sound-ready.mp3',
  idleReplay: 'idle-replay.mp3',
  repeatPattern: 'repeat-pattern.mp3',
  backToMenu: 'back-to-menu.mp3',
  rescanRoom: 'rescan-room.mp3',
};

const CHEER_IDS: readonly WallTonesClipId[] = [
  'cheer1',
  'cheer2',
  'cheer3',
  'cheer4',
  'cheer5',
  'cheer6',
];

const WRONG_IDS: readonly WallTonesClipId[] = [
  'wrong1',
  'wrong2',
  'wrong3',
  'wrong4',
  'wrong5',
];

const HYPE_IDS: readonly WallTonesClipId[] = ['hype1', 'hype2', 'hype3'];

/** Clips fetched and decoded up front so the first lines start instantly. */
const PRIORITY_CLIPS: readonly WallTonesClipId[] = [
  'welcome',
  'chooseMode',
  'howToPlay',
  'pointAndPress',
  'howToPlayRest',
  'cheer1',
  'wrong1',
];

export type WallTonesVoiceGender = 'male' | 'female';

const VOICE_GENDER_STORAGE_KEY = 'wall-tones-voice-gender';

function readStoredGender(): WallTonesVoiceGender {
  try {
    return globalThis.localStorage?.getItem(VOICE_GENDER_STORAGE_KEY) === 'female'
      ? 'female'
      : 'male';
  } catch {
    return 'male';
  }
}

let currentGender: WallTonesVoiceGender = readStoredGender();

export function getVoiceGender(): WallTonesVoiceGender {
  return currentGender;
}

/** Switch voice set. Drops decoded clips so the next line uses the new voice. */
export function setVoiceGender(gender: WallTonesVoiceGender): void {
  if (gender === currentGender) {
    return;
  }
  currentGender = gender;
  try {
    globalThis.localStorage?.setItem(VOICE_GENDER_STORAGE_KEY, gender);
  } catch {
    /* private mode - session-only choice */
  }
  bufferCache.clear();
}

function clipUrl(id: WallTonesClipId): string {
  if (id === 'newBest1' || id === 'newBest2' || id === 'newBest3') {
    return (currentGender === 'female' ? NEW_BEST_FEMALE : NEW_BEST_MALE)[id];
  }
  if (id === 'achvIntroPc' || id === 'achvIntroIphone' || id === 'achvIntroMr') {
    const female = currentGender === 'female';
    if (id === 'achvIntroPc') return female ? ACHV_INTRO_FEMALE_PC : ACHV_INTRO_MALE_PC;
    if (id === 'achvIntroIphone') return female ? ACHV_INTRO_FEMALE_IPHONE : ACHV_INTRO_MALE_IPHONE;
    return female ? ACHV_INTRO_FEMALE_MR : ACHV_INTRO_MALE_MR;
  }
  if (id === 'pickCombinedSlots') {
    return currentGender === 'female' ? PICK_COMBINED_FEMALE : PICK_COMBINED_MALE;
  }
  const file = WALL_TONES_CLIP_FILES[id];
  // document.baseURI keeps the path correct under Vite's relative base ('./'),
  // including GitHub Pages subpaths and the dev tunnel. Each voice gender is a
  // full clip set under its own folder.
  return new URL(`audio/speech/${currentGender}/${file}`, document.baseURI).href;
}

// Keep the same media element for the whole visit. Safari grants playback to
// the element played by the trusted Start tap, not to future new Audio() calls.
let mobileVoice: HTMLAudioElement | null = null;
let startupWelcome: Promise<void> | null = null;

export function prepareMobileWelcome(): void {
  if (!needsExplicitMobileSoundUnlock() || mobileVoice != null) return;
  mobileVoice = new Audio(clipUrl('welcome'));
  mobileVoice.preload = 'auto';
  mobileVoice.load();
}

/** Must be invoked directly in the native Start click, before any await. */
export function startMobileWelcomeFromGesture(): Promise<void> {
  // This direct trusted-tap path bypasses speakAsync, so honor its mute gate.
  // Subtitles still show the welcome line without audio (user, November 8).
  if (voicesOffEnabled()) {
    if (!hearingSubtitlesEnabled()) return Promise.resolve();
    const text = CLIP_TRANSCRIPTS.welcome;
    const token = startSpokenCaption(text);
    const words = text.split(/\s+/).filter(Boolean).length;
    const readingMs = Math.min(9000, 1200 + words * 350);
    const earlyCaption = document.createElement('div');
    earlyCaption.id = 'wall-tones-startup-subtitle';
    earlyCaption.setAttribute('aria-live', 'polite');
    earlyCaption.textContent = text;
    Object.assign(earlyCaption.style, {
      position: 'fixed', bottom: '24px', left: '12px', right: '12px',
      padding: '12px', background: '#081019', color: '#fff', borderRadius: '10px',
      font: '16px/1.4 sans-serif', textAlign: 'center', zIndex: '100001',
    });
    document.body.appendChild(earlyCaption);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        endSpokenCaption(token);
        earlyCaption.remove();
        resolve();
      }, readingMs);
    });
  }
  prepareMobileWelcome();
  if (mobileVoice == null) return Promise.resolve();
  const audio = mobileVoice;
  audio.src = clipUrl('welcome');
  audio.currentTime = 0;
  // play() itself, not a Promise callback, must run during trusted activation.
  let caption: number | undefined;
  let earlyCaption: HTMLDivElement | undefined;
  audio.onplaying = () => {
    caption = startSpokenCaption(CLIP_TRANSCRIPTS.welcome);
    if (hearingSubtitlesEnabled()) {
      earlyCaption = document.createElement('div');
      earlyCaption.id = 'wall-tones-startup-subtitle';
      earlyCaption.setAttribute('aria-live', 'polite');
      earlyCaption.textContent = CLIP_TRANSCRIPTS.welcome;
      Object.assign(earlyCaption.style, {
        position: 'fixed', bottom: '24px', left: '12px', right: '12px',
        padding: '12px', background: '#081019', color: '#fff', borderRadius: '10px',
        font: '16px/1.4 sans-serif', textAlign: 'center', zIndex: '100001',
      });
      document.body.appendChild(earlyCaption);
    }
  };
  const started = audio.play();
  const finished = new Promise<void>((resolve) => {
    const finish = () => {
      if (caption != null) endSpokenCaption(caption);
      earlyCaption?.remove();
      audio.onplaying = null;
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      resolve();
    };
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    window.setTimeout(finish, 15000);
  });
  // Bound the entire operation, including a play() promise that never starts.
  startupWelcome = Promise.race([started.then(() => finished), finished]);
  // The boot path observes rejection and leaves Start available for retry.
  void startupWelcome.catch(() => { startupWelcome = null; });
  return started;
}

let speechUnlocked = false;

function needsSpeechUnlock(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Called from the same tap that unlocks game audio. Resumes the shared audio
 * context and starts preloading the first clips.
 */
export function unlockSpeechFromGesture(): void {
  speechUnlocked = true;
  primeWallTonesAudioFromGesture();
  // Mobile speech uses the persistent HTML media route, not a decode job that
  // can hang behind a suspended/interrupted AudioContext on Safari.
  if (!needsExplicitMobileSoundUnlock()) void preloadPriorityClips();
}

export function resetSpeechUnlock(): void {
  speechUnlocked = !needsSpeechUnlock();
}

interface StorySpeechClip { readonly url: string; readonly text: string; }
type SpeechClip = WallTonesClipId | StorySpeechClip;
function speechUrl(clip: SpeechClip): string { return typeof clip === 'string' ? clipUrl(clip) : clip.url; }
function speechText(clip: SpeechClip): string { return typeof clip === 'string' ? CLIP_TRANSCRIPTS[clip] : clip.text; }
// URL keys include the captured cast. A late decode for one voice cannot poison another.
const bufferCache = new Map<string, AudioBuffer | null>();
const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>();

async function decodeClip(id: SpeechClip): Promise<AudioBuffer | null> {
  const url = speechUrl(id);
  const cached = bufferCache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const pending = pendingDecodes.get(url);
  if (pending != null) {
    return pending;
  }
  const job = (async (): Promise<AudioBuffer | null> => {
    try {
      const context = await ensureAudioRunning();
      if (context == null) {
        return null;
      }
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[wall-tones] missing voice clip ${id} (${response.status})`);
        return null;
      }
      const bytes = await response.arrayBuffer();
      return await context.decodeAudioData(bytes);
    } catch (error) {
      console.warn(`[wall-tones] voice clip ${id} unavailable`, error);
      return null;
    }
  })();
  pendingDecodes.set(url, job);
  const buffer = await job;
  pendingDecodes.delete(url);
  bufferCache.set(url, buffer);
  return buffer;
}

export function preloadPriorityClips(): Promise<unknown> {
  return Promise.all(PRIORITY_CLIPS.map((id) => decodeClip(id)));
}

/** Pick a random id from a pool, avoiding an immediate repeat. */
let lastRandomIds = new Set<WallTonesClipId>();

export function randomClipFrom(pool: readonly WallTonesClipId[]): WallTonesClipId {
  const fresh = pool.filter((id) => !lastRandomIds.has(id));
  const choices = fresh.length > 0 ? fresh : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)]!;
  lastRandomIds = new Set([pick]);
  return pick;
}

export function randomCheerClip(): WallTonesClipId {
  return randomClipFrom(CHEER_IDS);
}

export function randomWrongClip(): WallTonesClipId {
  return randomClipFrom(WRONG_IDS);
}

/** Milestone lines are fixed recordings, so they cannot say arbitrary numbers. */
export function milestoneClipFor(streak: number): WallTonesClipId {
  switch (streak) {
    case 5:
      return 'milestone5';
    case 10:
      return 'milestone10';
    case 15:
      return 'milestone15';
    case 20:
      return 'milestone20';
    default:
      return randomClipFrom(HYPE_IDS);
  }
}

export class WallTonesSpeech {
  /** Serialize lines so consecutive speak() calls do not overlap. */
  private chain: Promise<void> = Promise.resolve();

  /** Bumped by cancel() so lines queued on the old chain never start. */
  private generation = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentElement: HTMLAudioElement | null = null;
  /** Settles the active HTMLAudio playback; pause() alone never resolves it. */
  private activeElementFinish: (() => void) | null = null;
  /** Lines queued or playing right now; drives the Skip voice button. */
  private pendingLines = 0;
  /** One settle hook per counted line; cancel() flushes them so a superseded
   * line still awaiting decode/playback stops counting immediately instead of
   * whenever its promise happens to resolve. */
  private busyRuns = new Set<() => void>();
  /** One settle hook per in-flight speakAsync run; cancel() resolves them so
   * playback-queue callbacks awaiting a superseded line resume at once instead
   * of whenever its decode/fetch happens to complete. */
  private runSettlers = new Set<() => void>();

  /** False while iOS-style speech is still locked, so speak() would be dropped. */
  canSpeakNow(): boolean {
    return !(needsSpeechUnlock() && !speechUnlocked);
  }

  speak(id: WallTonesClipId, startupEntry = false): void {
    void this.speakAsync(id, startupEntry);
  }

  /** True while any narration line is queued or playing (skip can cancel it). */
  isBusy(): boolean {
    return this.pendingLines > 0;
  }

  /** Play a clip and resolve when it finishes, fails, or times out. */
  speakAsync(id: WallTonesClipId, startupEntry = false): Promise<void> {
    return this.enqueueClip(id, startupEntry);
  }

  /** Uses the existing speech queue, unlock, mute, captions and Skip lifecycle. */
  speakStoryLine(id: CypherLineId, cast: Readonly<CypherCast> = captureCypherCast(getVoiceGender())): Promise<void> {
    const line = findCypherLine(id);
    if (!line) return Promise.resolve();
    const gender = line.speaker === 'cypher' ? cast.cypher : cast.narrator;
    const url = new URL(`audio/story/${line.speaker}/${gender}/${id.toLowerCase()}.mp3`, document.baseURI).href;
    return this.enqueueClip({ url, text: `${line.speaker === 'cypher' ? 'Cypher' : 'Narrator'}: ${line.text}` });
  }

  speakBackgroundLine(id: BackgroundLineId, cast: Readonly<CypherCast>): Promise<void> {
    const line = CYPHER_BACKGROUND.find(line => line.id === id);
    if (!line) return Promise.resolve();
    return this.enqueueClip({ url: new URL(`audio/story/background/${cast.cypher}/${id.toLowerCase()}.mp3`, document.baseURI).href, text: `Cypher: ${line.text}` });
  }

  speakBackgroundEffect(id: 'open' | 'squawk' | 'close'): Promise<void> {
    return this.enqueueClip({ url: new URL(`audio/story/background/effects/${id}.mp3`, document.baseURI).href, text: id === 'close' ? '[radio squawk closes]' : '[radio squawk opens]' });
  }

  speakStoryEffect(id: 'open' | 'squawk' | 'close' | 'glitch' | 'shimmer'): Promise<void> {
    const captions = { open: '[radio static]', squawk: '[radio squawk]', close: '[radio closes]', glitch: '[game diagnostic glitch]', shimmer: '[light seam closes]' };
    return this.enqueueClip({ url: new URL(`audio/story/effects/${id}.mp3`, document.baseURI).href, text: captions[id] });
  }

  private enqueueClip(id: SpeechClip, startupEntry = false): Promise<void> {
    if (voicesOffEnabled()) {
      // Voices off silences the audio, not the words: with hearing subtitles
      // on, the narration line still shows as a caption for a reading beat.
      if (!hearingSubtitlesEnabled()) {
        return Promise.resolve();
      }
      return this.captionOnly(id);
    }
    if (needsSpeechUnlock() && !speechUnlocked) {
      return Promise.resolve();
    }
    this.pendingLines += 1;
    const gen = this.generation;
    const uncount = () => {
      if (this.busyRuns.delete(uncount)) {
        this.pendingLines -= 1;
      }
    };
    this.busyRuns.add(uncount);
    let settleRun!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      settleRun = resolve;
    });
    this.runSettlers.add(settleRun);
    const run = this.chain.then(() => {
      if (gen !== this.generation) {
        return; // superseded by cancel() while queued
      }
      // Race the line against cancel(): a superseded line stuck awaiting a
      // stalled decode/fetch still resolves its run, so callers awaiting
      // speakAsync (round intro, milestone chains) resume immediately.
      return Promise.race([this.playClip(id, gen, startupEntry), cancelled]);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      this.runSettlers.delete(settleRun);
      uncount();
    });
  }

  /** Subtitles-only line: show the transcript as a caption, no audio. */
  private captionOnly(id: SpeechClip): Promise<void> {
    this.pendingLines += 1;
    const gen = this.generation;
    const uncount = () => {
      if (this.busyRuns.delete(uncount)) {
        this.pendingLines -= 1;
      }
    };
    this.busyRuns.add(uncount);
    let settleRun!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      settleRun = resolve;
    });
    this.runSettlers.add(settleRun);
    const run = this.chain.then(() => {
      if (gen !== this.generation) {
        return; // superseded by cancel() while queued
      }
      const text = speechText(id);
      const token = startSpokenCaption(text);
      const words = text.split(/\s+/).filter(Boolean).length;
      const readingMs = Math.min(9000, 1200 + words * 350);
      const timed = new Promise<void>((resolve) => {
        setTimeout(() => {
          endSpokenCaption(token);
          resolve();
        }, readingMs);
      });
      return Promise.race([
        timed,
        cancelled.then(() => endSpokenCaption(token)),
      ]);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      this.runSettlers.delete(settleRun);
      uncount();
    });
  }

  private async playClip(id: SpeechClip, gen: number, startupEntry: boolean): Promise<void> {
    if (needsExplicitMobileSoundUnlock() && mobileVoice != null) {
      if (id === 'welcome' && startupEntry && startupWelcome != null) {
        const welcome = startupWelcome;
        startupWelcome = null;
        this.currentElement = mobileVoice;
        try {
          // Await the gesture-primed welcome, but let cancel() settle it too:
          // pausing the element never resolves this promise on its own, which
          // would keep isBusy() (Skip voice) stuck until the clip's watchdog.
          await new Promise<void>((resolve) => {
            this.activeElementFinish = resolve;
            void Promise.resolve(welcome).then(
              () => resolve(),
              () => resolve(),
            );
          });
        } finally {
          if (gen === this.generation) this.currentElement = null;
          this.activeElementFinish = null;
        }
        return;
      }
      return this.playElement(id);
    }
    const buffer = await decodeClip(id);
    if (gen !== this.generation) {
      return; // superseded by cancel() while decoding
    }
    if (buffer != null) {
      const context = await ensureAudioRunning();
      if (gen !== this.generation) {
        return; // superseded while resuming the audio context
      }
      if (context != null) {
        return this.playBuffer(context, buffer, id);
      }
    }
    // Fallback: plain HTMLAudio (e.g. Web Audio blocked before the first gesture).
    return this.playElement(id);
  }

  private playBuffer(
    context: AudioContext,
    buffer: AudioBuffer,
    id: SpeechClip,
  ): Promise<void> {
    return new Promise((resolve) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      this.currentSource = source;
      let caption: number | undefined;
      let settled = false;
      const finish = () => {
        if (caption != null) endSpokenCaption(caption);
        if (settled) {
          return;
        }
        settled = true;
        if (this.currentSource === source) {
          this.currentSource = null;
        }
        resolve();
      };
      source.onended = finish;
      // Safety net: onended does not fire when cancel() stops the source.
      window.setTimeout(finish, buffer.duration * 1000 + 800);
      try {
        source.start();
        caption = startSpokenCaption(speechText(id));
      } catch {
        finish();
      }
    });
  }

  private playElement(id: SpeechClip): Promise<void> {
    return new Promise((resolve) => {
      let caption: number | undefined;
      let settled = false;
      const finish = () => {
        if (caption != null) endSpokenCaption(caption);
        if (settled) {
          return;
        }
        settled = true;
        this.currentElement = null;
        this.activeElementFinish = null;
        resolve();
      };
      try {
        const audio = needsExplicitMobileSoundUnlock() && mobileVoice != null
          ? mobileVoice
          : new Audio(speechUrl(id));
        audio.src = speechUrl(id);
        audio.currentTime = 0;
        this.currentElement = audio;
        this.activeElementFinish = finish;
        audio.onended = finish;
        audio.onerror = finish;
        // Long setup clips must not be cut by a short media watchdog.
        window.setTimeout(finish, 60000);
        audio.onplaying = () => { caption = startSpokenCaption(speechText(id)); };
        void audio.play().catch(finish);
      } catch {
        finish();
      }
    });
  }

  cancel(): void {
    endSpokenCaption();
    this.generation += 1;
    try {
      this.currentSource?.stop();
    } catch {
      /* already stopped */
    }
    this.currentSource = null;
    if (this.currentElement != null) {
      this.currentElement.pause();
      this.currentElement = null;
    }
    // pause() fires neither ended nor error, so the playElement promise would
    // otherwise wait for its watchdog and keep isBusy() (Skip voice) stuck on.
    this.activeElementFinish?.();
    this.activeElementFinish = null;
    // Superseded lines can still be awaiting decode/fetch; stop counting them
    // now rather than when their promises happen to settle, and resolve those
    // runs so anything awaiting speakAsync resumes immediately.
    for (const uncount of [...this.busyRuns]) {
      uncount();
    }
    for (const settleRun of [...this.runSettlers]) {
      settleRun();
    }
    this.chain = Promise.resolve();
  }
}

// Back-compat alias: the flat desktop entry primed speech with a silent
// utterance; with recorded clips the gesture simply unlocks audio + preload.
export function warmSpeechFromGesture(): void {
  unlockSpeechFromGesture();
}

export function randomNewBestClip(firstRecord = false): WallTonesClipId {
  if (firstRecord) return 'newBest1';
  return (['newBest1', 'newBest2', 'newBest3'] as const)[Math.floor(Math.random() * 3)]!;
}
