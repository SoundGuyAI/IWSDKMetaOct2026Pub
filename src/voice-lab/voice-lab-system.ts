/**
 * Voice yes/no research lab.
 *
 * Isolated Cypher dialogue scene reached from the Lab menu's
 * "Voice Yes/No Lab" row. Same branching yes/no dialogue as the nod and
 * thumbs labs, but answers arrive by VOICE: the player says "yes" or "no"
 * into the mic. Recognition runs fully on-device with the vendored
 * TensorFlow.js speech-commands model (public/voice-lab/, same origin, no
 * audio upload). Owner, Nov 18 (intro wording approved Nov 19): in this
 * lab the channel is weak - only single clear words like yes or no come
 * through, anything else is noise at her end.
 *
 * Listen window (owner, Nov 18, "like the nod one, the listen 12 seconds
 * one"): after each prompt the receiver listens up to VOICE_LISTEN_SEC
 * seconds for one clear word. A clear yes/no answers; anything else - a
 * different word, a faint match, or silence - counts as noise and after
 * the window a rotating noise line plays before listening re-arms. The
 * panel's Yes/No buttons and Y/N keys always remain. All telemetry is
 * shown on the panel. Research scene: no accuracy claims, tuning is the
 * point of the PR. Mic input on Quest Browser is exactly what this lab
 * exists to check.
 */

import {
  createSystem,
  UIKit,
  UIKitMLAsset,
} from '@iwsdk/core';
import { unlockSpeechFromGesture } from '../wall-tones/speech.js';
import {
  BACKGROUND_NOISE_WORD,
  DEFAULT_ACCEPT_THRESHOLD,
  FrameWindow,
  parseAnswerWord,
  VOICE_LISTEN_SEC,
  VoiceReceiver,
  type HeardWord,
  type LiveHeard,
  type YesNoAnswer,
} from './voice-receiver.js';
import { playLabAnswerCue } from './lab-cues.js';
import {
  buildGestureLabScript,
  labAnswerFollowUp,
  labBranchIsNextPromptLine,
  labPromptById,
  type GestureLabScript,
  type LabPrompt,
  type LabScriptLine,
} from './lab-script.js';
import {
  CypherLabVoice,
  cypherLabVoiceSet,
  type LabVoiceStatus,
} from './lab-voice.js';

const VOICE_LAB_SCRIPT: GestureLabScript = buildGestureLabScript(
  {
    clipId: 'intro-voice',
    text: 'Connection check. This channel is weak. I can barely hear you through the static. Only single clear words make it across. Say yes or no, nothing else, or all I get is noise. First question. Can you hear me?',
  },
  {
    clipId: 'retry-voice',
    text: 'Only noise came through. One clear word is all this channel carries. Say yes if you can hear me now.',
  },
);

/**
 * No clear yes/no for a whole listen window counts as noise (owner's
 * fiction, Nov 18). Rotating lines, approved verbatim by the owner
 * Nov 19; clips ship via the chunk + decode-voice-clips workflow, and a
 * build without them still runs the silent text-preview mode.
 */
const NOISE_LINES: readonly LabScriptLine[] = [
  {
    clipId: 'noise-1',
    text: 'Static, nothing else. One clear word. Yes or no. Try again.',
  },
  {
    clipId: 'noise-2',
    text: 'Too much noise at my end. Slowly. One word. Again.',
  },
  {
    clipId: 'noise-3',
    text: 'The link caught no clear word. Widening the band. Once more.',
  },
  {
    clipId: 'noise-4',
    text: 'Still only interference. Yes or no, right into the mic.',
  },
];

type LabPhase =
  | 'idle'
  | 'speaking'
  | 'listening'
  | 'responding'
  | 'done'
  | 'inactive';

export interface VoiceLabDebugSnapshot {
  phase: LabPhase;
  promptId: string | null;
  lastAnswer: YesNoAnswer | null;
  lastWord: string | null;
  lastScore: number | null;
  liveWord: string | null;
  liveScore: number | null;
  bestWord: string | null;
  bestScore: number | null;
  noiseCount: number;
  receiverState: string;
  threshold: number;
  listenWindowSec: number;
  voiceStatus: string;
  answerCount: number;
  cueCount: number;
  clipPlays: Record<string, number>;
  skipVisible: boolean;
}

declare global {
  interface Window {
    __voiceLabDebug?: {
      snapshot: () => VoiceLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      answer: (answer: YesNoAnswer) => void;
      /** Cut the spoken line short, as the panel's Skip Voice button. */
      skip: () => void;
      /**
       * Simulate one model frame, e.g. feed('yes', 0.95). Optional rival
       * class + score simulates background noise, e.g.
       * feed('no', 0.55, '_background_noise_', 0.4).
       */
      feed: (
        word: string,
        score: number,
        rivalWord?: string,
        rivalScore?: number,
      ) => void;
    };
  }
}

export class VoiceLabSystem extends createSystem({}) {
  private readonly receiver = new VoiceReceiver();
  private readonly voice = new CypherLabVoice();
  private readonly script = VOICE_LAB_SCRIPT;
  private panel: UIKitMLAsset | null = null;
  private phase: LabPhase = 'inactive';
  private currentPrompt: LabPrompt | null = null;
  private currentLine: LabScriptLine | null = null;
  private retryLoopCount = 0;
  private noiseLoopCount = 0;
  private lastAnswer: YesNoAnswer | null = null;
  private lastWord: string | null = null;
  private lastScore: number | null = null;
  private live: LiveHeard | null = null;
  private bestWord: string | null = null;
  private bestScore = 0;
  private readonly debugFrames = new FrameWindow();
  private noiseCount = 0;
  private answerCount = 0;
  private voiceStatus: LabVoiceStatus | null = null;
  private cueCount = 0;
  private readonly clipPlays: Record<string, number> = {};
  private listeningIdleMs = 0;
  private lastIdleTickAt = 0;
  private lastUiUpdate = 0;
  private statusText: UIKit.Text | null = null;
  private lineText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private heardText: UIKit.Text | null = null;
  private voiceText: UIKit.Text | null = null;
  private startLabel: UIKit.Text | null = null;
  private skipButton: UIKit.Container | null = null;
  private active = false;
  private sequence = 0;

  init(): void {
    this.panel = this.world.getSceneObject<UIKitMLAsset>('voice-lab-panel') ?? null;
    if (this.panel == null) {
      console.warn('[voice-lab] voice-lab-panel scene object missing');
      return;
    }
    const panel = this.panel;
    this.statusText = panel.getElementById<UIKit.Text>('voice-lab-status');
    this.lineText = panel.getElementById<UIKit.Text>('voice-lab-line');
    this.telemetryText = panel.getElementById<UIKit.Text>('voice-lab-telemetry');
    this.heardText = panel.getElementById<UIKit.Text>('voice-lab-heard');
    this.voiceText = panel.getElementById<UIKit.Text>('voice-lab-voice');
    this.startLabel = panel.getElementById<UIKit.Text>('voice-lab-start-label');
    this.skipButton =
      panel.getElementById<UIKit.Container>('voice-lab-skip-button');

    panel.getElementById('voice-lab-start-button')?.addEventListener('click', () => {
      unlockSpeechFromGesture();
      void this.startRun();
    });
    panel
      .getElementById('voice-lab-yes-button')
      ?.addEventListener('click', () => this.submitAnswer('yes'));
    panel
      .getElementById('voice-lab-no-button')
      ?.addEventListener('click', () => this.submitAnswer('no'));
    panel
      .getElementById('voice-lab-repeat-button')
      ?.addEventListener('click', () => void this.repeatLine());
    panel
      .getElementById('voice-lab-skip-button')
      ?.addEventListener('click', () => this.skipVoice());
    // The Back button is bound by AppModeSystem, which owns the mode flip
    // back to 'lab'; the resulting mode event deactivates this lab.

    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.active) {
        return;
      }
      if (event.key === 'y' || event.key === 'Y') {
        this.submitAnswer('yes');
      } else if (event.key === 'n' || event.key === 'N') {
        this.submitAnswer('no');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail.mode;
      // Ask for the microphone at game start and lab-menu open so the first
      // question never pops the permission prompt mid-experience.
      if (mode === 'walltones' || mode === 'lab' || mode === 'voicelab') {
        void this.receiver.warmMicrophone();
      }
      this.setActive(mode === 'voicelab');
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    const restoredMode =
      window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu';
    if (
      restoredMode === 'walltones' ||
      restoredMode === 'lab' ||
      restoredMode === 'voicelab'
    ) {
      void this.receiver.warmMicrophone();
    }
    this.setActive(restoredMode === 'voicelab');

    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      delete window.__voiceLabDebug;
    });

    window.__voiceLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.setActive(true),
      start: () => void this.startRun(),
      answer: (answer) => this.submitAnswer(answer),
      skip: () => this.skipVoice(),
      feed: (word, score, rivalWord, rivalScore) =>
        this.handleFeed(word, score, rivalWord, rivalScore),
    };
    this.renderPanel('Open the link when you are ready.');
  }

  /**
   * Debug feed: build one frame like the model would produce and run it
   * through the same FrameWindow as live mic frames, so the e2e path
   * exercises the windowed decision (persistence vote included).
   */
  private handleFeed(
    word: string,
    score: number,
    rivalWord?: string,
    rivalScore?: number,
  ): void {
    const labels = ['yes', 'no', word];
    const answer = parseAnswerWord(word);
    const scores =
      answer === 'yes'
        ? [score, 0, 0]
        : answer === 'no'
          ? [0, score, 0]
          : [0, 0, score];
    if (rivalWord != null && rivalScore != null) {
      labels.push(rivalWord);
      scores.push(rivalScore);
    }
    const heard = this.debugFrames.push(labels, scores);
    const live: LiveHeard = {
      word,
      score,
      rivalWord: rivalWord ?? '-',
      rivalScore: rivalScore ?? 0,
    };
    this.handleHeard(heard, live);
  }

  private setActive(active: boolean): void {
    if (active === this.active) {
      return;
    }
    this.active = active;
    this.sequence += 1;
    void this.receiver.stopListening();
    this.voice.cancel();
    if (active) {
      this.phase = 'idle';
      this.currentPrompt = null;
      this.lastAnswer = null;
      this.lastWord = null;
      this.lastScore = null;
      this.live = null;
      this.bestWord = null;
      this.bestScore = 0;
      this.debugFrames.reset();
      this.noiseCount = 0;
      this.answerCount = 0;
      this.voiceStatus = null;
      void this.refreshVoiceStatus();
      this.renderPanel('Open the link when you are ready.');
    } else {
      this.phase = 'inactive';
    }
  }

  private async refreshVoiceStatus(): Promise<void> {
    const seq = this.sequence;
    const status = await this.voice.status();
    if (seq !== this.sequence) {
      return;
    }
    this.voiceStatus = status;
    this.renderPanel();
  }

  private voiceStatusLine(): string {
    if (this.voiceStatus == null) {
      return 'Cypher voice: checking...';
    }
    if (this.voiceStatus.kind === 'ready') {
      const name = this.voiceStatus.set === 'female' ? 'Kore (F)' : 'Algenib (M)';
      return `Cypher voice: ${name}`;
    }
    if (this.voiceStatus.kind === 'voices-off') {
      return 'Voices off: text-only run (accessibility setting).';
    }
    const name = this.voiceStatus.set === 'female' ? 'Kore (F)' : 'Algenib (M)';
    return `Cypher voice clips pending (${name}) - silent text preview.`;
  }

  private async startRun(): Promise<void> {
    if (!this.active || this.phase === 'speaking' || this.phase === 'responding') {
      return;
    }
    this.answerCount = 0;
    this.lastAnswer = null;
    this.lastWord = null;
    this.lastScore = null;
    this.live = null;
    this.bestWord = null;
    this.bestScore = 0;
    this.debugFrames.reset();
    this.noiseCount = 0;
    this.cueCount = 0;
    this.retryLoopCount = 0;
    this.noiseLoopCount = 0;
    for (const key of Object.keys(this.clipPlays)) {
      delete this.clipPlays[key];
    }
    // First run downloads the model (about 6 MB, once); the panel telemetry
    // shows progress while the intro line already plays.
    void this.receiver.prepare().catch(() => {
      this.renderPanel();
    });
    await this.playPrompt('intro');
  }

  private async playPrompt(
    promptId: string,
    advanceLoop = true,
  ): Promise<void> {
    const seq = ++this.sequence;
    const prompt = labPromptById(this.script, promptId);
    let line: LabScriptLine = prompt.line;
    if (prompt.loopVariations != null && prompt.loopVariations.length > 0) {
      const index = advanceLoop
        ? this.retryLoopCount++
        : Math.max(0, this.retryLoopCount - 1);
      line = prompt.loopVariations[index % prompt.loopVariations.length];
    }
    this.currentPrompt = prompt;
    this.currentLine = line;
    // The live Heard line deliberately survives a prompt change: after a
    // miss the player must still see what the model heard. The per-attempt
    // best yes/no and the frame window reset for the new attempt.
    this.bestWord = null;
    this.bestScore = 0;
    this.debugFrames.reset();
    await this.receiver.stopListening();
    this.phase = 'speaking';
    this.renderPanel();
    await this.speakLine(line);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    this.armListening();
  }

  private armListening(): void {
    this.phase = 'listening';
    this.listeningIdleMs = 0;
    this.lastIdleTickAt = performance.now();
    const seq = this.sequence;
    void (async () => {
      try {
        await this.receiver.prepare();
      } catch {
        // Prepare failed: buttons and keys stay the answer path; telemetry
        // carries the reason.
        this.renderPanel();
        return;
      }
      if (seq !== this.sequence || !this.active || this.phase !== 'listening') {
        return;
      }
      await this.receiver.startListening((heard, live) =>
        this.handleHeard(heard, live),
      );
      this.renderPanel();
    })();
    this.renderPanel();
  }

  private handleHeard(heard: HeardWord, live: LiveHeard): void {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
    // Every frame updates the Heard line, miss or not, so a failed attempt
    // shows exactly what the model heard and how close it was.
    this.live = live;
    if (
      (live.word === 'yes' || live.word === 'no') &&
      live.score > this.bestScore
    ) {
      this.bestWord = live.word;
      this.bestScore = live.score;
    }
    this.lastWord = heard.kind === 'answer' ? heard.answer : heard.word;
    this.lastScore = heard.score;
    if (heard.kind === 'answer') {
      this.submitAnswer(heard.answer);
      return;
    }
    // Only a yes/no attempt counts: a faint yes or no feeds the noise
    // count and keeps the listen window open. Any other word - a command,
    // a faint partial alias, unknown speech - is ignored at her end
    // (owner, Nov 19): not an answer, not an attempt, and it does
    // not extend the window. The Heard line still shows it.
    if (heard.word === 'yes' || heard.word === 'no') {
      this.noiseCount += 1;
      this.listeningIdleMs = 0;
      this.lastIdleTickAt = performance.now();
    }
    this.renderPanel();
  }

  private async repeatLine(): Promise<void> {
    if (!this.active || this.currentPrompt == null) {
      return;
    }
    if (this.phase === 'speaking' || this.phase === 'responding') {
      return;
    }
    await this.playPrompt(this.currentPrompt.id, false);
  }

  /**
   * Skip Voice (owner, Nov 19): while Cypher is talking, cut the current
   * line short and move on - the dialogue continues exactly as if the
   * line had finished.
   */
  private skipVoice(): void {
    if (
      !this.active ||
      (this.phase !== 'speaking' && this.phase !== 'responding')
    ) {
      return;
    }
    this.voice.skip();
  }

  private submitAnswer(answer: YesNoAnswer): void {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
    const prompt = this.currentPrompt;
    const seq = ++this.sequence;
    this.phase = 'responding';
    void this.receiver.stopListening();
    this.lastAnswer = answer;
    this.answerCount += 1;
    this.renderPanel();
    const { branch, nextPromptId } = labAnswerFollowUp(prompt, answer);
    void (async () => {
      this.cueCount += 1;
      await playLabAnswerCue(answer);
      if (seq !== this.sequence || !this.active) {
        return;
      }
      if (!labBranchIsNextPromptLine(this.script, branch, nextPromptId)) {
        this.renderPanel(branch.text);
        await this.speakLine(branch);
        if (seq !== this.sequence || !this.active) {
          return;
        }
      }
      if (nextPromptId == null || nextPromptId === 'end') {
        if (nextPromptId === 'end') {
          const endPrompt = labPromptById(this.script, 'end');
          this.renderPanel(endPrompt.line.text);
          await this.speakLine(endPrompt.line);
          if (seq !== this.sequence || !this.active) {
            return;
          }
        }
        this.phase = 'done';
        this.currentPrompt = null;
        this.currentLine = null;
        this.renderPanel('Link check complete. Cypher out.');
        return;
      }
      await this.playPrompt(nextPromptId);
    })();
  }

  /**
   * One full listen window with no clear yes/no: play a rotating noise
   * line, then re-arm listening on the same prompt.
   */
  private async playNoiseLine(): Promise<void> {
    const seq = ++this.sequence;
    const line = NOISE_LINES[this.noiseLoopCount++ % NOISE_LINES.length];
    this.currentLine = line;
    await this.receiver.stopListening();
    this.phase = 'speaking';
    this.renderPanel();
    await this.speakLine(line);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    this.armListening();
  }

  update(): void {
    if (!this.active) {
      return;
    }
    // The no-input window only runs while the receiver is truly streaming:
    // with no mic (flat CI runs, denied permission) the buttons and keys
    // are the answer path and no noise loop spins.
    if (this.phase === 'listening' && this.receiver.state === 'listening') {
      const nowMs = performance.now();
      this.listeningIdleMs += nowMs - this.lastIdleTickAt;
      this.lastIdleTickAt = nowMs;
      if (this.listeningIdleMs >= VOICE_LISTEN_SEC * 1000) {
        this.listeningIdleMs = 0;
        void this.playNoiseLine();
      }
    }
    const now = performance.now();
    if (now - this.lastUiUpdate >= 100) {
      this.lastUiUpdate = now;
      this.renderPanel();
    }
  }

  private renderPanel(overrideLine?: string): void {
    if (!this.active) {
      return;
    }
    const listening =
      this.receiver.state === 'listening'
        ? 'Listening. Say yes or no - one clear word.'
        : this.receiver.state === 'mic-unavailable' ||
            this.receiver.state === 'error'
          ? 'No mic on this device - use the Yes/No buttons (or Y/N keys).'
          : 'Preparing the local word model...';
    const statusByPhase: Record<LabPhase, string> = {
      inactive: '',
      idle: 'Open the link when you are ready.',
      speaking: 'Cypher is transmitting...',
      listening,
      responding: 'Answer received.',
      done: 'Link check complete. Cypher out.',
    };
    this.statusText?.setProperties({
      text: overrideLine ?? statusByPhase[this.phase],
    });
    this.lineText?.setProperties({
      text: this.currentLine?.text ?? '',
    });
    const last =
      this.lastWord == null
        ? '-'
        : `${this.lastWord} (${this.lastScore?.toFixed(2) ?? '-'})`;
    this.heardText?.setProperties({ text: this.heardLine() });
    this.telemetryText?.setProperties({
      text:
        `receiver ${this.receiver.describe()} | last heard ${last} | ` +
        `noise ${this.noiseCount} | threshold ${DEFAULT_ACCEPT_THRESHOLD} | ` +
        `listen window ${VOICE_LISTEN_SEC}s`,
    });
    this.voiceText?.setProperties({ text: this.voiceStatusLine() });
    this.startLabel?.setProperties({
      text: this.phase === 'done' ? 'Run link check again' : 'Open the link',
    });
    this.skipButton?.setProperties({
      display:
        this.phase === 'speaking' || this.phase === 'responding'
          ? 'flex'
          : 'none',
    } as never);
  }

  /** Friendly label: the model's internal classes read as plain words. */
  private friendlyWord(word: string): string {
    if (word === BACKGROUND_NOISE_WORD) {
      return 'background noise';
    }
    if (word === '_unknown_') {
      return 'unknown speech';
    }
    return word;
  }

  /**
   * The prominent Heard line: the live frame's top class and its rival,
   * plus the best yes/no the model has caught this attempt, so a miss
   * shows what almost made it.
   */
  private heardLine(): string {
    if (this.live == null) {
      return 'Heard: -';
    }
    const parts = [
      `Heard: ${this.friendlyWord(this.live.word)} (${this.live.score.toFixed(2)})`,
    ];
    if (this.live.rivalWord !== '-') {
      parts.push(
        `vs ${this.friendlyWord(this.live.rivalWord)} (${this.live.rivalScore.toFixed(2)})`,
      );
    }
    if (this.bestWord != null) {
      parts.push(
        `best this attempt: ${this.bestWord} (${this.bestScore.toFixed(2)})`,
      );
    }
    return parts.join(' | ');
  }

  private speakLine(line: LabScriptLine): Promise<void> {
    this.clipPlays[line.clipId] = (this.clipPlays[line.clipId] ?? 0) + 1;
    return this.voice.speak(cypherLabVoiceSet(), line);
  }

  private debugSnapshot(): VoiceLabDebugSnapshot {
    return {
      phase: this.phase,
      promptId: this.currentPrompt?.id ?? null,
      lastAnswer: this.lastAnswer,
      lastWord: this.lastWord,
      lastScore: this.lastScore,
      liveWord: this.live?.word ?? null,
      liveScore: this.live?.score ?? null,
      bestWord: this.bestWord,
      bestScore: this.bestWord == null ? null : this.bestScore,
      noiseCount: this.noiseCount,
      receiverState: this.receiver.state,
      threshold: DEFAULT_ACCEPT_THRESHOLD,
      listenWindowSec: VOICE_LISTEN_SEC,
      voiceStatus: this.voiceStatusLine(),
      answerCount: this.answerCount,
      cueCount: this.cueCount,
      clipPlays: { ...this.clipPlays },
      skipVisible: this.phase === 'speaking' || this.phase === 'responding',
    };
  }
    }
