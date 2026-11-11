/**
 * Thumbs yes/no research lab (backlog item 52, thumbs up/down half).
 *
 * Isolated Cypher dialogue scene reached from the main menu's
 * "Thumbs Yes/No Lab" button. Same one-way-channel framing as the nod lab:
 * Cypher sees the player through the link but cannot hear them, so answers
 * are hand gestures: thumb up for yes, thumb down for no. The detected
 * answer is echoed in Cypher's voice ("Yes." / "No."), then the dialogue
 * branches.
 *
 * Detection: per-hand XRHand joint classification, see thumbs-gesture.ts.
 * Runs only while immersive with hand tracking; flat mode uses the panel's
 * Yes/No buttons (and Y/N keys). Research scene: no accuracy claims.
 */

import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { unlockSpeechFromGesture } from '../wall-tones/speech.js';
import {
  DEFAULT_THUMB_GESTURE_CONFIG,
  THUMB_JOINT_NAMES,
  ThumbGestureDetector,
  type ThumbHandJoints,
  type Vec3Like,
  type YesNoAnswer,
} from './thumbs-gesture.js';
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

const THUMBS_LAB_SCRIPT: GestureLabScript = buildGestureLabScript(
  {
    clipId: 'intro-thumbs',
    text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So thumb up for yes. Thumb down for no. First question. Can you hear me?',
  },
  {
    clipId: 'retry-thumbs',
    text: 'No? Then the channel is still weak. Let me boost the signal. Show me again. Thumb up if you can hear me now.',
  },
);

type LabPhase =
  | 'idle'
  | 'speaking'
  | 'listening'
  | 'responding'
  | 'done'
  | 'inactive';

/** Minimal WebXR hand-input surface, cast from the live frame like the
 * guided-sensing prototype does for gaze. */
type XrJointSpaceLike = object;
type XrHandLike = { get?: (joint: string) => XrJointSpaceLike | undefined };
type XrInputSourceLike = {
  handedness?: string;
  hand?: XrHandLike | null;
};
type XrFrameLike = {
  getJointPose?: (
    joint: XrJointSpaceLike,
    space: object,
  ) => { transform: { position: Vec3Like } } | null;
};

export interface ThumbsLabDebugSnapshot {
  phase: LabPhase;
  promptId: string | null;
  lastAnswer: YesNoAnswer | null;
  lastHand: string | null;
  lastAlignment: number | null;
  leftTracked: boolean;
  rightTracked: boolean;
  leftAlignment: number;
  rightAlignment: number;
  detectorArmed: boolean;
  immersive: boolean;
  voiceStatus: string;
  answerCount: number;
}

declare global {
  interface Window {
    __thumbsLabDebug?: {
      snapshot: () => ThumbsLabDebugSnapshot;
      enter: () => void;
      start: () => void;
      answer: (answer: YesNoAnswer) => void;
      feed: (left: ThumbHandJoints | null, right: ThumbHandJoints | null) => void;
    };
  }
}

export class ThumbsLabSystem extends createSystem({}) {
  private readonly detector = new ThumbGestureDetector();
  private readonly voice = new CypherLabVoice();
  private readonly script = THUMBS_LAB_SCRIPT;
  private panel: UIKitMLAsset | null = null;
  private phase: LabPhase = 'inactive';
  private currentPrompt: LabPrompt | null = null;
  private lastAnswer: YesNoAnswer | null = null;
  private lastHand: string | null = null;
  private lastAlignment: number | null = null;
  private answerCount = 0;
  private voiceStatus: LabVoiceStatus | null = null;
  private leftTracked = false;
  private rightTracked = false;
  private lastUiUpdate = 0;
  private statusText: UIKit.Text | null = null;
  private lineText: UIKit.Text | null = null;
  private telemetryText: UIKit.Text | null = null;
  private voiceText: UIKit.Text | null = null;
  private startLabel: UIKit.Text | null = null;
  private active = false;
  private sequence = 0;

  init(): void {
    this.panel = this.world.getSceneObject<UIKitMLAsset>('thumbs-lab-panel') ?? null;
    if (this.panel == null) {
      console.warn('[thumbs-lab] thumbs-lab-panel scene object missing');
      return;
    }
    const panel = this.panel;
    this.statusText = panel.getElementById<UIKit.Text>('thumbs-lab-status');
    this.lineText = panel.getElementById<UIKit.Text>('thumbs-lab-line');
    this.telemetryText = panel.getElementById<UIKit.Text>('thumbs-lab-telemetry');
    this.voiceText = panel.getElementById<UIKit.Text>('thumbs-lab-voice');
    this.startLabel = panel.getElementById<UIKit.Text>('thumbs-lab-start-label');

    panel.getElementById('thumbs-lab-start-button')?.addEventListener('click', () => {
      unlockSpeechFromGesture();
      void this.startRun();
    });
    panel
      .getElementById('thumbs-lab-yes-button')
      ?.addEventListener('click', () => this.submitAnswer('yes'));
    panel
      .getElementById('thumbs-lab-no-button')
      ?.addEventListener('click', () => this.submitAnswer('no'));
    panel
      .getElementById('thumbs-lab-repeat-button')
      ?.addEventListener('click', () => void this.repeatLine());
    // The Back button is bound by AppModeSystem, which owns the mode flip
    // back to 'menu'; the resulting mode event deactivates this lab.

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
      this.setActive(mode === 'thumbslab');
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.setActive(
      (window.sessionStorage.getItem('iwsdk-experience-mode') ?? 'menu') ===
        'thumbslab',
    );

    this.cleanupFuncs.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('experience-mode-changed', onModeChange);
      this.setActive(false);
      delete window.__thumbsLabDebug;
    });

    window.__thumbsLabDebug = {
      snapshot: () => this.debugSnapshot(),
      enter: () => this.setActive(true),
      start: () => void this.startRun(),
      answer: (answer) => this.submitAnswer(answer),
      feed: (left, right) => this.handleHands(left, right, performance.now() / 1000),
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
      this.lastHand = null;
      this.lastAlignment = null;
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
    this.lastHand = null;
    this.lastAlignment = null;
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

  private submitAnswer(answer: YesNoAnswer): void {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
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

  /** Read one hand's joints from the live XR frame; null if unavailable. */
  private sampleHand(handedness: 'left' | 'right'): ThumbHandJoints | null {
    const session = this.xrManager.getSession();
    const frame = this.xrManager.getFrame() as XrFrameLike | null;
    const referenceSpace = this.xrManager.getReferenceSpace();
    if (
      session == null ||
      frame == null ||
      referenceSpace == null ||
      typeof frame.getJointPose !== 'function' ||
      session.visibilityState !== 'visible'
    ) {
      return null;
    }
    const sources = session.inputSources as unknown as Iterable<XrInputSourceLike>;
    for (const source of sources) {
      if (source.handedness !== handedness || source.hand == null) {
        continue;
      }
      const hand = source.hand;
      const read = (joint: string): Vec3Like | null => {
        const space = hand.get?.(joint);
        if (space == null) {
          return null;
        }
        try {
          const pose = frame.getJointPose?.(space, referenceSpace as object);
          return pose?.transform.position ?? null;
        } catch {
          return null;
        }
      };
      const wrist = read(THUMB_JOINT_NAMES.wrist);
      const thumbProximal = read(THUMB_JOINT_NAMES.thumbProximal);
      const thumbTip = read(THUMB_JOINT_NAMES.thumbTip);
      const indexProximal = read(THUMB_JOINT_NAMES.indexProximal);
      const indexTip = read(THUMB_JOINT_NAMES.indexTip);
      const middleProximal = read(THUMB_JOINT_NAMES.middleProximal);
      const middleTip = read(THUMB_JOINT_NAMES.middleTip);
      if (
        wrist == null ||
        thumbProximal == null ||
        thumbTip == null ||
        indexProximal == null ||
        indexTip == null ||
        middleProximal == null ||
        middleTip == null
      ) {
        return null;
      }
      return {
        wrist,
        thumbProximal,
        thumbTip,
        indexProximal,
        indexTip,
        middleProximal,
        middleTip,
      };
    }
    return null;
  }

  private handleHands(
    left: ThumbHandJoints | null,
    right: ThumbHandJoints | null,
    now: number,
  ): void {
    this.leftTracked = left != null;
    this.rightTracked = right != null;
    const event = this.detector.feed(left, right, now);
    if (event != null) {
      this.lastHand = event.hand;
      this.lastAlignment = event.alignment;
      this.submitAnswer(event.answer);
    }
  }

  update(): void {
    if (!this.active) {
      return;
    }
    if (this.phase === 'listening' && this.isImmersive()) {
      this.handleHands(
        this.sampleHand('left'),
        this.sampleHand('right'),
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
        ? 'Listening. Thumb up for yes, thumb down for no.'
        : 'Listening. Hand tracking needs XR - use the Yes/No buttons (or Y/N keys).',
      responding: 'Answer received.',
      done: 'Link check complete. Cypher out.',
    };
    this.statusText?.setProperties({
      text: overrideLine ?? statusByPhase[this.phase],
    });
    this.lineText?.setProperties({
      text: this.currentPrompt?.line.text ?? '',
    });
    const align = (value: number) => value.toFixed(2);
    const last =
      this.lastAlignment == null
        ? '-'
        : `${this.lastAnswer ?? '-'} (${this.lastHand ?? '-'} hand, align ${this.lastAlignment.toFixed(2)})`;
    this.telemetryText?.setProperties({
      text:
        `L hand ${this.leftTracked ? `tracked align ${align(this.detector.handAlignment('left'))}` : 'not tracked'} | ` +
        `R hand ${this.rightTracked ? `tracked align ${align(this.detector.handAlignment('right'))}` : 'not tracked'} | ` +
        `detector ${this.detector.isEnabled ? 'armed' : 'off'} | last answer ${last} | ` +
        `thresholds align ${DEFAULT_THUMB_GESTURE_CONFIG.alignmentMin} hold ${DEFAULT_THUMB_GESTURE_CONFIG.holdSec}s`,
    });
    this.voiceText?.setProperties({ text: this.voiceStatusLine() });
    this.startLabel?.setProperties({
      text: this.phase === 'done' ? 'Run link check again' : 'Open the link',
    });
  }

  private debugSnapshot(): ThumbsLabDebugSnapshot {
    return {
      phase: this.phase,
      promptId: this.currentPrompt?.id ?? null,
      lastAnswer: this.lastAnswer,
      lastHand: this.lastHand,
      lastAlignment: this.lastAlignment,
      leftTracked: this.leftTracked,
      rightTracked: this.rightTracked,
      leftAlignment: this.detector.handAlignment('left'),
      rightAlignment: this.detector.handAlignment('right'),
      detectorArmed: this.detector.isEnabled,
      immersive: this.isImmersive(),
      voiceStatus: this.voiceStatusLine(),
      answerCount: this.answerCount,
    };
  }
      }
