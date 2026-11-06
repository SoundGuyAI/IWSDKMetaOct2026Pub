import { CLIP_TRANSCRIPTS } from './clip-transcripts.js';
import { startSpokenCaption, endSpokenCaption, hearingSubtitlesEnabled } from './accessibility.js';
import { NEW_BEST_MALE } from './new-best-male.js';
import { NEW_BEST_FEMALE } from './new-best-female.js';
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

const bufferCache = new Map<WallTonesClipId, AudioBuffer | null>();
const pendingDecodes = new Map<WallTonesClipId, Promise<AudioBuffer | null>>();

async function decodeClip(id: WallTonesClipId): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const pending = pendingDecodes.get(id);
  if (pending != null) {
    return pending;
  }
  const job = (async (): Promise<AudioBuffer | null> => {
    try {
      const context = await ensureAudioRunning();
      if (context == null) {
        return null;
      }
      const response = await fetch(clipUrl(id));
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
  pendingDecodes.set(id, job);
  const buffer = await job;
  pendingDecodes.delete(id);
  bufferCache.set(id, buffer);
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
    const run = this.chain.then(() => {
      if (gen !== this.generation) {
        return; // superseded by cancel() while queued
      }
      return this.playClip(id, gen, startupEntry);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(uncount);
  }

  private async playClip(id: WallTonesClipId, gen: number, startupEntry: boolean): Promise<void> {
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
    id: WallTonesClipId,
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
        caption = startSpokenCaption(CLIP_TRANSCRIPTS[id]);
      } catch {
        finish();
      }
    });
  }

  private playElement(id: WallTonesClipId): Promise<void> {
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
          : new Audio(clipUrl(id));
        audio.src = clipUrl(id);
        audio.currentTime = 0;
        this.currentElement = audio;
        this.activeElementFinish = finish;
        audio.onended = finish;
        audio.onerror = finish;
        // Long setup clips must not be cut by a short media watchdog.
        window.setTimeout(finish, 60000);
        audio.onplaying = () => { caption = startSpokenCaption(CLIP_TRANSCRIPTS[id]); };
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
    // now rather than when their promises happen to settle.
    for (const uncount of [...this.busyRuns]) {
      uncount();
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
