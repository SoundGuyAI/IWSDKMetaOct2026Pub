/**
 * Voice receiver for the Voice Yes/No lab.
 *
 * Ports the proven local-inference path of the standalone voice workbench
 * (public/voice-lab/, PR177) into the in-game lab: the vendored TensorFlow.js
 * speech-commands BROWSER_FFT model runs entirely on-device and is loaded
 * from this same origin. No audio leaves the device in this mode.
 *
 * Kept free of IWSDK imports so node tests can exercise the pure decision
 * helpers. Browser-only pieces (script injection, getUserMedia) are guarded
 * and surface as plain Error messages the panel can show.
 */

export type YesNoAnswer = 'yes' | 'no';

/** The model's 20 classes; only these two answer the dialogue. */
export const ANSWER_WORDS: readonly string[] = ['yes', 'no'];

/**
 * Every other recognized word is noise for this lab (owner, Nov 18: she can
 * barely hear, only single clear words like yes or no come through; anything
 * else is noise at her end).
 */
export type HeardWord =
  | { kind: 'answer'; answer: YesNoAnswer; score: number }
  | { kind: 'noise'; word: string; score: number }
  | { kind: 'faint'; word: string; score: number };

export const DEFAULT_ACCEPT_THRESHOLD = 0.8;

/**
 * Accent/headset fallback (owner, Nov 19 live test: his spoken "no" did
 * something but was never accepted - the model heard it under the full
 * threshold). A yes/no below DEFAULT_ACCEPT_THRESHOLD still answers when
 * it is the unambiguous winner: at least this floor and at least
 * CLEAR_WIN_RATIO times every other class, including the other answer
 * word. The lab fiction asks for one clear word, not one loud word.
 */
export const CLEAR_WIN_FLOOR = 0.5;
export const CLEAR_WIN_RATIO = 2;

/**
 * The model's background-noise class. A real room keeps it scoring while a
 * word is being spoken (phone mic, AGC still ramping), so it must not veto
 * a clear winner: it is the channel floor, not a rival word. `_unknown_`
 * (real speech the model does not know) still vetoes.
 */
export const BACKGROUND_NOISE_WORD = '_background_noise_';

/**
 * Persistence vote for words split across analysis windows (owner's Nov 19
 * iPhone retest: yes/no register but take 2-3 attempts). The model window
 * overlaps 50%, so a word caught across a window boundary shows a moderate
 * score in two adjacent frames instead of a strong score in one. When the
 * same answer word clears these relaxed bars in PERSIST_MIN_HITS of the
 * last PERSIST_FRAMES frames, it answers with its best score. Relaxed bars
 * stay strict enough that ordinary noise (which varies frame to frame)
 * cannot vote twice.
 */
export const PERSIST_FLOOR = 0.35;
export const PERSIST_RATIO = 1.5;
export const PERSIST_FRAMES = 3;
export const PERSIST_MIN_HITS = 2;

/** The lab listens this long for one clear word before calling it noise. */
export const VOICE_LISTEN_SEC = 12;

/**
 * Interpret one model result. A top class at or above the threshold
 * counts outright; yes/no answer the prompt, any other accepted word is
 * noise. Below the threshold a yes/no still answers when it clearly beats
 * every other class; anything weaker is faint.
 */
export function interpretScores(
  labels: readonly string[],
  scores: readonly number[],
  threshold: number = DEFAULT_ACCEPT_THRESHOLD,
): HeardWord {
  if (
    labels.length === 0 ||
    labels.length !== scores.length ||
    scores.some((x) => !Number.isFinite(x))
  ) {
    return { kind: 'faint', word: 'invalid', score: 0 };
  }
  const index = scores.indexOf(Math.max(...scores));
  const word = labels[index];
  const score = scores[index];
  if (score >= threshold) {
    if (word === 'yes' || word === 'no') {
      return { kind: 'answer', answer: word, score };
    }
    return { kind: 'noise', word, score };
  }
  const clearWin = clearWinningAnswer(labels, scores);
  if (clearWin != null) {
    return clearWin;
  }
  return { kind: 'faint', word, score };
}

/**
 * The stronger of the two answer words when it clears CLEAR_WIN_FLOOR and
 * beats every other class by CLEAR_WIN_RATIO; null otherwise. Only runs
 * on below-threshold results, so it can never override an accepted word.
 */
function clearWinningAnswer(
  labels: readonly string[],
  scores: readonly number[],
): HeardWord | null {
  let answer: YesNoAnswer | null = null;
  let answerIndex = -1;
  let answerScore = 0;
  for (const word of ANSWER_WORDS) {
    const i = labels.indexOf(word);
    if (i >= 0 && scores[i] > answerScore) {
      answer = word as YesNoAnswer;
      answerIndex = i;
      answerScore = scores[i];
    }
  }
  if (answer == null || answerScore < CLEAR_WIN_FLOOR) {
    return null;
  }
  for (let i = 0; i < scores.length; i += 1) {
    if (labels[i] === BACKGROUND_NOISE_WORD) {
      continue;
    }
    if (i !== answerIndex && scores[i] * CLEAR_WIN_RATIO > answerScore) {
      return null;
    }
  }
  return { kind: 'answer', answer, score: answerScore };
}

/** One raw model callback: the class labels and their scores. */
export interface ScoreFrame {
  labels: readonly string[];
  scores: readonly number[];
}

/**
 * clearWinningAnswer with the relaxed persistence bars; null otherwise.
 * Only used inside interpretFrames, never on its own.
 */
function persistentAnswer(
  labels: readonly string[],
  scores: readonly number[],
): YesNoAnswer | null {
  if (labels.length === 0 || labels.length !== scores.length) {
    return null;
  }
  let answer: YesNoAnswer | null = null;
  let answerIndex = -1;
  let answerScore = 0;
  for (const word of ANSWER_WORDS) {
    const i = labels.indexOf(word);
    if (i >= 0 && scores[i] > answerScore) {
      answer = word as YesNoAnswer;
      answerIndex = i;
      answerScore = scores[i];
    }
  }
  if (answer == null || answerScore < PERSIST_FLOOR) {
    return null;
  }
  for (let i = 0; i < scores.length; i += 1) {
    if (labels[i] === BACKGROUND_NOISE_WORD) {
      continue;
    }
    if (i !== answerIndex && scores[i] * PERSIST_RATIO > answerScore) {
      return null;
    }
  }
  return answer;
}

/**
 * Interpret the recent frame window. The latest frame decides first,
 * exactly as interpretScores; only when it is faint does the persistence
 * vote run over the last PERSIST_FRAMES frames.
 */
export function interpretFrames(
  frames: readonly ScoreFrame[],
  threshold: number = DEFAULT_ACCEPT_THRESHOLD,
): HeardWord {
  const latest = frames[frames.length - 1];
  if (latest == null) {
    return { kind: 'faint', word: 'invalid', score: 0 };
  }
  const heard = interpretScores(latest.labels, latest.scores, threshold);
  if (heard.kind !== 'faint') {
    return heard;
  }
  const votes = new Map<YesNoAnswer, { count: number; best: number }>();
  for (const frame of frames) {
    const vote = persistentAnswer(frame.labels, frame.scores);
    if (vote == null) {
      continue;
    }
    const i = frame.labels.indexOf(vote);
    const entry = votes.get(vote) ?? { count: 0, best: 0 };
    entry.count += 1;
    entry.best = Math.max(entry.best, frame.scores[i]);
    votes.set(vote, entry);
  }
  let winner: YesNoAnswer | null = null;
  let winnerCount = 0;
  let winnerBest = 0;
  let tied = false;
  for (const [answer, entry] of votes) {
    if (entry.count > winnerCount) {
      winner = answer;
      winnerCount = entry.count;
      winnerBest = entry.best;
      tied = false;
    } else if (entry.count === winnerCount) {
      tied = true;
    }
  }
  if (winner != null && !tied && winnerCount >= PERSIST_MIN_HITS) {
    return { kind: 'answer', answer: winner, score: winnerBest };
  }
  return heard;
}

/**
 * Ring buffer of the last PERSIST_FRAMES model frames. The receiver feeds
 * every callback through it; the debug bridge uses its own instance so the
 * e2e feed() path exercises the same windowed decision as the mic.
 */
export class FrameWindow {
  private frames: ScoreFrame[] = [];

  push(labels: readonly string[], scores: readonly number[]): HeardWord {
    this.frames.push({ labels, scores });
    if (this.frames.length > PERSIST_FRAMES) {
      this.frames.shift();
    }
    return interpretFrames(this.frames);
  }

  reset(): void {
    this.frames = [];
  }
}

/** The live top two classes of one raw frame, for the panel's Heard line. */
export interface LiveHeard {
  word: string;
  score: number;
  rivalWord: string;
  rivalScore: number;
}

/** Top two classes of one frame, for display only - never for decisions. */
export function topTwo(
  labels: readonly string[],
  scores: readonly number[],
): LiveHeard {
  let first = -1;
  let second = -1;
  for (let i = 0; i < scores.length; i += 1) {
    if (first < 0 || scores[i] > scores[first]) {
      second = first;
      first = i;
    } else if (second < 0 || scores[i] > scores[second]) {
      second = i;
    }
  }
  if (first < 0) {
    return { word: 'invalid', score: 0, rivalWord: '-', rivalScore: 0 };
  }
  return {
    word: labels[first],
    score: scores[first],
    rivalWord: second < 0 ? '-' : labels[second],
    rivalScore: second < 0 ? 0 : scores[second],
  };
}

/** Single-word natural variants that still mean yes/no (owner, Nov 19). */
const YES_VARIANTS: readonly string[] = ['yes', 'yeah', 'yep', 'yup'];
const NO_VARIANTS: readonly string[] = ['no', 'nope', 'nah'];

/** Normalize a free-text word (browser-speech path or test feeds). */
export function parseAnswerWord(text: string): YesNoAnswer | null {
  const word = String(text).toLowerCase().trim().replace(/[.!?,]+$/u, '');
  if (YES_VARIANTS.includes(word)) {
    return 'yes';
  }
  if (NO_VARIANTS.includes(word)) {
    return 'no';
  }
  return null;
}

/** Minimal vendored-global surface loaded from public/voice-lab/vendor/. */
interface SpeechCommandsRecognizer {
  ensureModelLoaded(): Promise<void>;
  listen(
    callback: (result: {
      scores: ArrayLike<number>;
      spectrogram?: unknown;
    }) => void,
    options?: {
      includeSpectrogram?: boolean;
      probabilityThreshold?: number;
      invokeCallbackOnNoiseAndUnknown?: boolean;
      overlapFactor?: number;
    },
  ): Promise<void>;
  stopListening(): Promise<void>;
  wordLabels(): string[];
}

interface SpeechCommandsGlobal {
  create(
    model: string,
    comms: null,
    modelUrl: string,
    metadataUrl: string,
  ): SpeechCommandsRecognizer;
}

interface TfGlobal {
  ready(): Promise<void>;
  getBackend(): string;
}

declare global {
  interface Window {
    tf?: TfGlobal;
    speechCommands?: SpeechCommandsGlobal;
  }
}

function vendorUrl(file: string): string {
  return new URL(`voice-lab/vendor/${file}`, document.baseURI).href;
}

function modelUrl(file: string): string {
  return new URL(`voice-lab/model/${file}`, document.baseURI).href;
}

/**
 * Inject one vendored script once, in order. speech-commands needs the tf
 * global first, so the two load strictly sequentially.
 */
function loadScriptOnce(url: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-voice-lab-vendor="${url}"]`,
  );
  if (existing != null) {
    if (existing.dataset.loaded === 'true') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load ${url}`)),
        { once: true },
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.dataset.voiceLabVendor = url;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load ${url}`)),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

export type VoiceReceiverState =
  | 'cold'
  | 'loading-model'
  | 'ready'
  | 'listening'
  | 'mic-unavailable'
  | 'error';

/**
 * Owns the one recognizer instance and the vendored script loading. The
 * system drives it; every failure resolves to a state plus a message, never
 * an unhandled rejection.
 */
export class VoiceReceiver {
  private recognizer: SpeechCommandsRecognizer | null = null;
  private loadPromise: Promise<void> | null = null;
  private readonly frames = new FrameWindow();
  state: VoiceReceiverState = 'cold';
  detail = '';
  backend: string | null = null;

  /** Load vendored scripts and the model. Idempotent. */
  async prepare(): Promise<void> {
    if (this.state === 'ready' || this.state === 'listening') {
      return;
    }
    this.loadPromise ??= (async () => {
      if (
        typeof globalThis.isSecureContext !== 'undefined' &&
        !globalThis.isSecureContext
      ) {
        throw new Error('Voice input needs HTTPS (or localhost).');
      }
      this.state = 'loading-model';
      this.detail = 'Loading local word model...';
      await loadScriptOnce(vendorUrl('tf.min.js'));
      await loadScriptOnce(vendorUrl('speech-commands.min.js'));
      const tf = window.tf;
      const speechCommands = window.speechCommands;
      if (tf == null || speechCommands == null) {
        throw new Error('Vendored TensorFlow scripts did not load.');
      }
      await tf.ready();
      this.backend = tf.getBackend();
      // speech-commands 0.5.4 rejects relative URLs; resolve same-origin
      // model files against the app base URL (same fix as the workbench).
      this.recognizer = speechCommands.create(
        'BROWSER_FFT',
        null,
        modelUrl('model.json'),
        modelUrl('metadata.json'),
      );
      await this.recognizer.ensureModelLoaded();
      this.state = 'ready';
      this.detail = 'Local word model ready.';
    })();
    try {
      await this.loadPromise;
    } catch (error) {
      // Allow a retry after a transient failure (offline hiccup).
      this.loadPromise = null;
      this.state = 'error';
      this.detail = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Start streaming recognition. Each model callback is interpreted and
   * handed to onHeard. A getUserMedia failure moves the receiver to
   * 'mic-unavailable' and resolves false - the caller keeps its button and
   * keyboard fallbacks live.
   */
  async startListening(
    onHeard: (heard: HeardWord, live: LiveHeard) => void,
  ): Promise<boolean> {
    if (this.recognizer == null || this.state !== 'ready') {
      return false;
    }
    const labels = this.recognizer.wordLabels() as readonly string[];
    this.frames.reset();
    try {
      await this.recognizer.listen(
        (result) => {
          const scores = Array.from(result.scores as ArrayLike<number>);
          onHeard(this.frames.push(labels, scores), topTwo(labels, scores));
        },
        {
          // The model's own probability gate stays low; the lab's 0.8
          // acceptance threshold decides what counts as a clear word.
          probabilityThreshold: 0.1,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.5,
        },
      );
      this.state = 'listening';
      this.detail = 'Listening for one clear word.';
      return true;
    } catch (error) {
      this.state = 'mic-unavailable';
      this.detail =
        error instanceof Error ? error.message : 'Microphone unavailable.';
      return false;
    }
  }

  async stopListening(): Promise<void> {
    if (this.state !== 'listening' || this.recognizer == null) {
      return;
    }
    try {
      await this.recognizer.stopListening();
    } catch {
      // A stop failure must not wedge the dialogue.
    }
    if (this.state === 'listening') {
      this.state = 'ready';
      this.detail = 'Local word model ready.';
    }
  }

  /** Debug/test snapshot of the receiver for the panel telemetry. */
  describe(): string {
    const backend = this.backend == null ? '' : ` backend ${this.backend}`;
    return `${this.state}${backend}${this.detail === '' ? '' : ` - ${this.detail}`}`;
  }
}
