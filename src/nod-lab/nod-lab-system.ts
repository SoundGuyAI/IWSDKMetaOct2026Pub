/**
 * Nod yes/no research lab (backlog item 52, head-nod half).
 *
 * An isolated Cypher dialogue scene reached from the main menu's
 * "Nod Yes/No Lab" button. Cypher's channel is one-way (Act 1 canon: he can
 * see the player through the link but cannot hear them), so answers are head
 * gestures: nod for yes, shake for no. The detected answer is acknowledged
 * with a distinct gentle sound cue (one for yes, one for no, lab only), then
 * the dialogue branches (owner, Nov 14: no spoken "Yes."/"No." echo).
 *
 * Detection: baseline-relative pitch/yaw oscillation, see head-gesture.ts.
 * Immersive runs read the headset; flat mode answers by pointer drag
 * (up-down = yes, left-right = no) and, after the Start tap grants motion
 * access on phones, by tilting the phone (forward/back = yes, left/right =
 * no) - both reuse the same detector, and the panel's Yes/No buttons and
 * Y/N keys always remain. Sensors are sampled only while a prompt is
 * listening; nothing is tracked outside the lab. All telemetry is shown on
 * the panel. This is a research scene: no accuracy claims, tuning is the
 * point of the PR.
 */

import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { Euler, Quaternion } from 'three';
import { unlockSpeechFromGesture } from '../wall-tones/speech.js';
import {
  DEFAULT_HEAD_GESTURE_CONFIG,
  HeadNodShakeDetector,
  type YesNoAnswer,
} from './head-gesture.js';
import { playLabAnswerCue } from './lab-cues.js';
import {
  attachPointerTracker,
  PointerGestureTracker,
  type GestureAngleSample,
} from './pointer-gesture.js';
import {
  attachTiltTracker,
  requestTiltPermission,
  TiltBaselineTracker,
} from './tilt-gesture.js';
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

/**
 * Owner, Nov 14: about 6 seconds with no answer at all counts as another
 * no-case, but Cypher acknowledges that nothing came through and asks to
 * try again. The wording below is a DRAFT pending owner approval; until
 * approved (and clips generated) it runs in the lab's silent text-preview
 * mode like the retry variations did.
 */
export const NO_INPUT_TIMEOUT_SEC = 6;
const NO_INPUT_LINE: LabScriptLine = {
  clipId: 'no-input-nod',
  text: 'Nothing came through. I saw no movement. Let us try again.',
};

const NOD_LAB_SCRIPT: GestureLabScript = buildGestureLabScript(
  {
    clipId: 'intro-nod',
    text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So nod your head for yes. Shake it for no. First question. Can you hear me?',
  },
  {
    clipId: 'retry-nod',
    text: 'No? Then the channel is still weak. Let me boost the signal. Try again. Can you hear me now?',
  },
  NO_INPUT_LINE,
);

type LabPhase =
  | 'idle'
  | 'speaking'
  | 'listening'
  | 'responding'
  | 'done'
  | 'inactive';

export interface NodLabDebugSnapshot {
  phase: LabPhase;
  promptId: string | null;
  lastAnswer: YesNoAnswer | null;
  lastAmplitudeDeg: number | null;
  pitchDeg: number;
  yawDeg: number;
  detectorArmed: boolean;
  flatDetectorArmed: boolean;
  tilt: 'off' | 'on' | 'denied';
  immersive: boolean;
  voiceStatus: string;
  answerCount: number;
  cueCount: number;
  noInputCount: number;
  clipPlays: Record<string, number>;
}

declare global {
  interface Window {
    __nodLabDebug?: {
      snapshot: () => NodLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      answer: (answer: YesNoAnswer) => void;
      feedAngles: (pitchDeg: number, yawDeg: number) => void;
      feedFlatAngles: (pitchDeg: number, yawDeg: number) => void;
    };
  }
}

export class NodLabSystem extends createSystem({}) {
  private readonly detector = new HeadNodShakeDetector();
  // Flat-mode gestures must be true out-and-back swings: a one-way drag
  // toward the panel buttons never completes a cycle.
  private readonly flatDetector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  private readonly pointerTracker = new PointerGestureTracker();
  private readonly tiltTracker = new TiltBaselineTracker();
  private tiltState: 'off' | 'on' | 'denied' = 'off';
  private detachPointer: (() => void) | null = null;
  private detachTilt: (() => void) | null = null;
  private readonly voice = new CypherLabVoice();
  private readonly script = NOD_LAB_SCRIPT;
  private panel: UIKitMLAsset | null = null;
  private phase: LabPhase = 'inactive';
  private currentPrompt: LabPrompt | null = null;
  private currentLine: LabScriptLine | null = null;
  private retryLoopCount = 0;
  private lastAnswer: YesNoAnswer | null = null;
  private lastAmplitudeDeg: number | null = null;
  private answerCount = 0;
  private voiceStatus: LabVoiceStatus | null = null;
  private cueCount = 0;
  private noInputCount = 0;
  private listeningIdleMs = 0;
  private lastIdleTickAt = 0;
  private readonly clipPlays: Record<string, number> = {};
  private readonly baselineQuat = new Quaternion();
  private readonly headQuat = new Quaternion();
  private readonly relativeQuat = new Quaternion();
  private readonly relativeEuler = new Euler();
  private pitchDeg = 0;
  private yawDeg = 0;
  private lastUiUpdate = 0;
  private statusText: UIKit.Text | null = null;
  private lineText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private voiceText: UIKit.Text | null = null;
  private startLabel: UIKit.Text | null = null;
  private active = false;
  private sequence = 0;

  init(): void {
    this.panel = this.world.getSceneObject<UIKitMLAsset>('nod-lab-panel') ?? null;
    if (this.panel == null) {
      console.warn('[nod-lab] nod-lab-panel scene object missing');
      return;
    }
    const panel = this.panel;
    this.statusText = panel.getElementById<UIKit.Text>('nod-lab-status');
    this.lineText = panel.getElementById<UIKit.Text>('nod-lab-line');
    this.telemetryText = panel.getElementById<UIKit.Text>('nod-lab-telemetry');
    this.voiceText = panel.getElementById<UIKit.Text>('nod-lab-voice');
    this.startLabel = panel.getElementById<UIKit.Text>('nod-lab-start-label');

    const startButton = panel.getElementById('nod-lab-start-button');
    startButton?.addEventListener('click', () => {
      unlockSpeechFromGesture();
      // Phones gate orientation behind a per-gesture permission prompt; the
      // Start tap is that gesture. A denial is respected silently (the
      // pointer-drag and button paths keep working) and is never re-asked.
      void this.setupTilt();
      void this.startRun();
    });
    panel
      .getElementById('nod-lab-yes-button')
      ?.addEventListener('click', () => this.submitAnswer('yes', 'button'));
    panel
      .getElementById('nod-lab-no-button')
      ?.addEventListener('click', () => this.submitAnswer('no', 'button'));
    panel
      .getElementById('nod-lab-repeat-button')
      ?.addEventListener('click', () => void this.repeatLine());
    // The Back button is bound by AppModeSystem, which owns the mode flip
    // back to 'menu'; the resulting mode event deactivates this lab.

    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.active) {
        return;
      }
      if (event.key === 'y' || event.key === 'Y') {
        this.submitAnswer('yes', 'key');
      } else if (event.key === 'n' || event.key === 'N') {
        this.submitAnswer('no', 'key');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    this.detachPointer = attachPointerTracker(
      window,
      this.pointerTracker,
      () => this.flatDetector.isEnabled,
      (sample, now) => this.handleFlatAngles(sample, now, 'pointer'),
      () => this.flatDetector.reset(),
    );

    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: string }>).detail.mode;
      this.setActive(mode === 'nodlab');
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.setActive(
      (window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu') ===
        'nodlab',
    );

    this.cleanupFuncs.push(() => {
      this.detachPointer?.();
      this.detachTilt?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      delete window.__nodLabDebug;
    });

    window.__nodLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.setActive(true),
      start: () => void this.startRun(),
      answer: (answer) => this.submitAnswer(answer, 'debug'),
      feedAngles: (pitchDeg, yawDeg) =>
        this.handleAngles(pitchDeg, yawDeg, performance.now() / 1000),
      feedFlatAngles: (pitchDeg, yawDeg) =>
        this.handleFlatAngles(
          { pitchDeg, yawDeg },
          performance.now() / 1000,
          'debug',
        ),
    };
    this.renderPanel('Open the link when you are ready.');
  }

  private setActive(active: boolean): void {
    if (active === this.active) {
      return;
    }
    this.active = active;
    this.sequence += 1;
    this.detector.setEnabled(false);
    this.flatDetector.setEnabled(false);
    this.pointerTracker.reset();
    this.tiltTracker.reset();
    this.voice.cancel();
    if (active) {
      this.phase = 'idle';
      this.currentPrompt = null;
      this.lastAnswer = null;
      this.lastAmplitudeDeg = null;
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
    this.lastAmplitudeDeg = null;
    this.cueCount = 0;
    this.noInputCount = 0;
    this.retryLoopCount = 0;
    for (const key of Object.keys(this.clipPlays)) {
      delete this.clipPlays[key];
    }
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
      // Approved Nov 14: each retry loop speaks the next variation.
      const index = advanceLoop
        ? this.retryLoopCount++
        : Math.max(0, this.retryLoopCount - 1);
      line = prompt.loopVariations[index % prompt.loopVariations.length];
    }
    this.currentPrompt = prompt;
    this.currentLine = line;
    this.detector.setEnabled(false);
    this.phase = 'speaking';
    this.renderPanel();
    await this.speakLine(line);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    this.armListening();
  }

  private armListening(): void {
    const immersive = this.isImmersive();
    this.player.head.getWorldQuaternion(this.baselineQuat);
    this.detector.reset();
    this.detector.setEnabled(immersive);
    this.flatDetector.reset();
    this.flatDetector.setEnabled(!immersive);
    this.pointerTracker.reset();
    this.tiltTracker.reset();
    this.listeningIdleMs = 0;
    this.lastIdleTickAt = performance.now();
    this.phase = 'listening';
    this.renderPanel();
  }

  private async setupTilt(): Promise<void> {
    if (this.tiltState !== 'off') {
      return;
    }
    const permission = await requestTiltPermission();
    if (permission === 'denied') {
      this.tiltState = 'denied';
      this.renderPanel();
      return;
    }
    if (permission === 'unsupported') {
      return;
    }
    this.tiltState = 'on';
    this.detachTilt ??= attachTiltTracker(
      window,
      this.tiltTracker,
      () => this.flatDetector.isEnabled,
      (sample, now) => this.handleFlatAngles(sample, now, 'tilt'),
    );
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
   * No input inside the answer window: acknowledge that nothing came
   * through, then re-ask the same prompt (retry variations do not rotate
   * on a no-input loop). Not an answer: no cue, no answerCount.
   */
  private async handleNoInput(): Promise<void> {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
    const prompt = this.currentPrompt;
    const seq = ++this.sequence;
    this.phase = 'responding';
    this.detector.setEnabled(false);
    this.flatDetector.setEnabled(false);
    this.noInputCount += 1;
    this.renderPanel();
    await this.speakLine(this.script.noInput ?? NO_INPUT_LINE);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    await this.playPrompt(prompt.id, false);
  }

  private submitAnswer(
    answer: YesNoAnswer,
    source: 'gesture' | 'button' | 'key' | 'debug' | 'pointer' | 'tilt',
  ): void {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
    void source;
    const prompt = this.currentPrompt;
    const seq = ++this.sequence;
    this.phase = 'responding';
    this.detector.setEnabled(false);
    this.lastAnswer = answer;
    this.answerCount += 1;
    this.renderPanel();
    const { branch, nextPromptId } = labAnswerFollowUp(prompt, answer);
    void (async () => {
      // Acknowledge the detected answer with a distinct SFX cue (owner,
      // Nov 14: a gentle sound per answer, not Cypher saying "Yes."/"No.").
      this.cueCount += 1;
      await playLabAnswerCue(answer);
      if (seq !== this.sequence || !this.active) {
        return;
      }
      // When the branch IS the next prompt's own line (intro -yes-> q2),
      // playPrompt speaks it once; speaking it here repeated it on hardware.
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

  private isImmersive(): boolean {
    return (
      this.world.xrEnabled &&
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive &&
      this.xrManager.getSession() != null
    );
  }

  private handleAngles(pitchDeg: number, yawDeg: number, now: number): void {
    this.pitchDeg = pitchDeg;
    this.yawDeg = yawDeg;
    const event = this.detector.feed(
      (pitchDeg * Math.PI) / 180,
      (yawDeg * Math.PI) / 180,
      now,
    );
    if (event != null) {
      this.lastAmplitudeDeg = (event.amplitudeRad * 180) / Math.PI;
      this.submitAnswer(event.answer, 'gesture');
    }
  }

  private handleFlatAngles(
    sample: GestureAngleSample,
    now: number,
    source: 'pointer' | 'tilt' | 'debug',
  ): void {
    this.pitchDeg = sample.pitchDeg;
    this.yawDeg = sample.yawDeg;
    const event = this.flatDetector.feed(
      (sample.pitchDeg * Math.PI) / 180,
      (sample.yawDeg * Math.PI) / 180,
      now,
    );
    if (event != null) {
      this.lastAmplitudeDeg = (event.amplitudeRad * 180) / Math.PI;
      this.submitAnswer(event.answer, source);
    }
  }

  update(): void {
    if (!this.active) {
      return;
    }
    if (this.phase === 'listening' && this.script.noInput != null) {
      // Answer-window timer (owner, Nov 14): ~6s of no input counts as a
      // no-case. Runs only while a prompt is actually listening - never
      // while a line plays, and paused while the tab is hidden.
      const nowMs = performance.now();
      if (!document.hidden) {
        this.listeningIdleMs += nowMs - this.lastIdleTickAt;
      }
      this.lastIdleTickAt = nowMs;
      if (this.listeningIdleMs >= NO_INPUT_TIMEOUT_SEC * 1000) {
        void this.handleNoInput();
      }
    }
    if (this.phase === 'listening' && this.isImmersive()) {
      this.player.head.getWorldQuaternion(this.headQuat);
      this.relativeQuat
        .copy(this.baselineQuat)
        .invert()
        .multiply(this.headQuat);
      this.relativeEuler.setFromQuaternion(this.relativeQuat, 'YXZ');
      this.handleAngles(
        (this.relativeEuler.x * 180) / Math.PI,
        (this.relativeEuler.y * 180) / Math.PI,
        performance.now() / 1000,
      );
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
    const statusByPhase: Record<LabPhase, string> = {
      inactive: '',
      idle: 'Open the link when you are ready.',
      speaking: 'Cypher is transmitting...',
      listening: this.isImmersive()
        ? 'Listening. Nod for yes, shake for no.'
        : this.tiltState === 'on'
          ? 'Listening. Tilt forward/back for yes, left/right for no - or tap the buttons.'
          : 'Listening. Move your mouse up or down for yes, left or right for no - or use the buttons (Y/N).',
      responding: 'Answer received.',
      done: 'Link check complete. Cypher out.',
    };
    this.statusText?.setProperties({
      text: overrideLine ?? statusByPhase[this.phase],
    });
    this.lineText?.setProperties({
      text: this.currentLine?.text ?? '',
    });
    const amp =
      this.lastAmplitudeDeg == null
        ? '-'
        : `${this.lastAmplitudeDeg.toFixed(1)} deg`;
    this.telemetryText?.setProperties({
      text:
        `pitch ${this.pitchDeg.toFixed(1)} deg | yaw ${this.yawDeg.toFixed(1)} deg | ` +
        `detector ${this.isImmersive() ? (this.detector.isEnabled ? 'armed' : 'off') : this.flatDetector.isEnabled ? 'flat-armed' : 'flat-off'} | ` +
        `last answer ${this.lastAnswer ?? '-'} (${amp}) | ` +
        `thresholds act ${(DEFAULT_HEAD_GESTURE_CONFIG.activationRad * 180 / Math.PI).toFixed(0)} deg ` +
        `peak ${(DEFAULT_HEAD_GESTURE_CONFIG.minPeakRad * 180 / Math.PI).toFixed(0)} deg`,
    });
    this.voiceText?.setProperties({ text: this.voiceStatusLine() });
    this.startLabel?.setProperties({
      text: this.phase === 'done' ? 'Run link check again' : 'Open the link',
    });
  }

  private speakLine(line: LabScriptLine): Promise<void> {
    this.clipPlays[line.clipId] = (this.clipPlays[line.clipId] ?? 0) + 1;
    return this.voice.speak(cypherLabVoiceSet(), line);
  }

  private debugSnapshot(): NodLabDebugSnapshot {
    return {
      phase: this.phase,
      promptId: this.currentPrompt?.id ?? null,
      lastAnswer: this.lastAnswer,
      lastAmplitudeDeg: this.lastAmplitudeDeg,
      pitchDeg: this.pitchDeg,
      yawDeg: this.yawDeg,
      detectorArmed: this.detector.isEnabled,
      flatDetectorArmed: this.flatDetector.isEnabled,
      tilt: this.tiltState,
      immersive: this.isImmersive(),
      voiceStatus: this.voiceStatusLine(),
      answerCount: this.answerCount,
      cueCount: this.cueCount,
      noInputCount: this.noInputCount,
      clipPlays: { ...this.clipPlays },
    };
  }
}
