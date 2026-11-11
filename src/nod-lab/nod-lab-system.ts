/**
 * Nod yes/no research lab (backlog item 52, head-nod half).
 *
 * An isolated Cypher dialogue scene reached from the main menu's
 * "Nod Yes/No Lab" button. Cypher's channel is one-way (Act 1 canon: he can
 * see the player through the link but cannot hear them), so answers are head
 * gestures: nod for yes, shake for no. The detected answer is echoed back in
 * Cypher's voice ("Yes." / "No."), then the dialogue branches.
 *
 * Detection: baseline-relative head pitch/yaw oscillation, see head-gesture.ts.
 * Runs only while immersive; flat mode uses the panel's Yes/No buttons (and
 * Y/N keys) so the dialogue flow stays testable everywhere. All telemetry is
 * shown on the panel. This is a research scene: no accuracy claims, headset
 * tuning is the point of the PR.
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
import {
  buildGestureLabScript,
  labAnswerFollowUp,
  labPromptById,
  type GestureLabScript,
  type LabPrompt,
} from './lab-script.js';
import {
  CypherLabVoice,
  cypherLabVoiceSet,
  type LabVoiceStatus,
} from './lab-voice.js';

const NOD_LAB_SCRIPT: GestureLabScript = buildGestureLabScript(
  {
    clipId: 'intro-nod',
    text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So nod your head for yes. Shake it for no. First question. Can you hear me?',
  },
  {
    clipId: 'retry-nod',
    text: 'No? Then the channel is still weak. Let me boost the signal. Try again. Can you hear me now?',
  },
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
  immersive: boolean;
  voiceStatus: string;
  answerCount: number;
}

declare global {
  interface Window {
    __nodLabDebug?: {
      snapshot: () => NodLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      answer: (answer: YesNoAnswer) => void;
      feedAngles: (pitchDeg: number, yawDeg: number) => void;
    };
  }
}

export class NodLabSystem extends createSystem({}) {
  private readonly detector = new HeadNodShakeDetector();
  private readonly voice = new CypherLabVoice();
  private readonly script = NOD_LAB_SCRIPT;
  private panel: UIKitMLAsset | null = null;
  private phase: LabPhase = 'inactive';
  private currentPrompt: LabPrompt | null = null;
  private lastAnswer: YesNoAnswer | null = null;
  private lastAmplitudeDeg: number | null = null;
  private answerCount = 0;
  private voiceStatus: LabVoiceStatus | null = null;
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
    await this.playPrompt('intro');
  }

  private async playPrompt(promptId: string): Promise<void> {
    const seq = ++this.sequence;
    const prompt = labPromptById(this.script, promptId);
    this.currentPrompt = prompt;
    this.detector.setEnabled(false);
    this.phase = 'speaking';
    this.renderPanel();
    await this.voice.speak(cypherLabVoiceSet(), prompt.line);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    this.armListening();
  }

  private armListening(): void {
    this.player.head.getWorldQuaternion(this.baselineQuat);
    this.detector.reset();
    this.detector.setEnabled(this.isImmersive());
    this.phase = 'listening';
    this.renderPanel();
  }

  private async repeatLine(): Promise<void> {
    if (!this.active || this.currentPrompt == null) {
      return;
    }
    if (this.phase === 'speaking' || this.phase === 'responding') {
      return;
    }
    await this.playPrompt(this.currentPrompt.id);
  }

  private submitAnswer(
    answer: YesNoAnswer,
    source: 'gesture' | 'button' | 'key' | 'debug',
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
      // Echo the detected answer first, then the branch line (owner request:
      // the voice repeats what you did - yes/no).
      await this.voice.speak(cypherLabVoiceSet(), this.script.feedback[answer]);
      if (seq !== this.sequence || !this.active) {
        return;
      }
      this.renderPanel(branch.text);
      await this.voice.speak(cypherLabVoiceSet(), branch);
      if (seq !== this.sequence || !this.active) {
        return;
      }
      if (nextPromptId == null || nextPromptId === 'end') {
        if (nextPromptId === 'end') {
          const endPrompt = labPromptById(this.script, 'end');
          this.renderPanel(endPrompt.line.text);
          await this.voice.speak(cypherLabVoiceSet(), endPrompt.line);
          if (seq !== this.sequence || !this.active) {
            return;
          }
        }
        this.phase = 'done';
        this.currentPrompt = null;
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

  update(): void {
    if (!this.active) {
      return;
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
        : 'Listening. Head tracking needs XR - use the Yes/No buttons (or Y/N keys).',
      responding: 'Answer received.',
      done: 'Link check complete. Cypher out.',
    };
    this.statusText?.setProperties({
      text: overrideLine ?? statusByPhase[this.phase],
    });
    this.lineText?.setProperties({
      text: this.currentPrompt?.line.text ?? '',
    });
    const amp =
      this.lastAmplitudeDeg == null
        ? '-'
        : `${this.lastAmplitudeDeg.toFixed(1)} deg`;
    this.telemetryText?.setProperties({
      text:
        `pitch ${this.pitchDeg.toFixed(1)} deg | yaw ${this.yawDeg.toFixed(1)} deg | ` +
        `detector ${this.detector.isEnabled ? 'armed' : 'off'} | ` +
        `last answer ${this.lastAnswer ?? '-'} (${amp}) | ` +
        `thresholds act ${(DEFAULT_HEAD_GESTURE_CONFIG.activationRad * 180 / Math.PI).toFixed(0)} deg ` +
        `peak ${(DEFAULT_HEAD_GESTURE_CONFIG.minPeakRad * 180 / Math.PI).toFixed(0)} deg`,
    });
    this.voiceText?.setProperties({ text: this.voiceStatusLine() });
    this.startLabel?.setProperties({
      text: this.phase === 'done' ? 'Run link check again' : 'Open the link',
    });
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
      immersive: this.isImmersive(),
      voiceStatus: this.voiceStatusLine(),
      answerCount: this.answerCount,
    };
  }
}
