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

/** The lab listens this long for one clear word before calling it noise. */
export const VOICE_LISTEN_SEC = 12;

/**
 * Interpret one model result. Only a top class at or above the threshold
 * counts; yes/no answer the prompt, any other accepted word is noise.
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
  if (score < threshold) {
    return { kind: 'faint', word, score };
  }
  if (word === 'yes' || word === 'no') {
    return { kind: 'answer', answer: word, score };
  }
  return { kind: 'noise', word, score };
}

/** Normalize a free-text word (browser-speech path or test feeds). */
export function parseAnswerWord(text: string): YesNoAnswer | null {
  const word = String(text).toLowerCase().trim().replace(/[.!?,]+$/u, '');
  return word === 'yes' || word === 'no' ? word : null;
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
  async startListening(onHeard: (heard: HeardWord) => void): Promise<boolean> {
    if (this.recognizer == null || this.state !== 'ready') {
      return false;
    }
    const labels = this.recognizer.wordLabels() as readonly string[];
    try {
      await this.recognizer.listen(
        (result) => {
          const scores = Array.from(result.scores as ArrayLike<number>);
          onHeard(interpretScores(labels, scores));
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
