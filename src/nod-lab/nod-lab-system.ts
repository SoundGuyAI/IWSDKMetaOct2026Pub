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
  FLAT_HEAD_GESTURE_CONFIG,
  HeadNodShakeDetector,
  type HeadGestureConfig,
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
 * try again. The four lines were approved verbatim by the owner Nov 14
 * (quote-replied "Ok" to the exact set) and rotate like the retry
 * variations. Clips pending generation; until they land the lines run in
 * the lab's silent text-preview mode.
 */
export const NO_INPUT_TIMEOUT_SEC = 6;
const NO_INPUT_LINES: readonly LabScriptLine[] = [
  {
    clipId: 'no-input-1',
    text: 'Nothing. No movement on my end. The link is still open. Try again.',
  },
  {
    clipId: 'no-input-2',
    text: "I saw nothing. Could be the link, could be you didn't move. Again.",
  },
  {
    clipId: 'no-input-3',
    text: 'Still no movement. Widening the band anyway. Show me once more.',
  },
  {
    clipId: 'no-input-4',
    text: 'No nod, no shake. Giving the channel a moment. Try again.',
  },
];

/**
 * Intro and reminder lines per device (Nov 14): the intro names the
 * device's input (headset keeps the script's recorded head-gesture line;
 * desktop asks for mouse movement; phones ask for a tilt). After a
 * no-input line, Cypher appends only the short device-specific reminder
 * instead of repeating the full prompt.
 */
const INTRO_DESKTOP_LINE: LabScriptLine = {
  clipId: 'intro-nod-desktop',
  text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So move your mouse up or down for yes, left or right for no. First question. Can you hear me?',
};
const INTRO_TILT_LINE: LabScriptLine = {
  clipId: 'intro-nod-tilt',
  text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So tilt your phone forward or back for yes, left or right for no. First question. Can you hear me?',
};
const REMIND_LINES: Record<'desktop' | 'headset' | 'tilt', LabScriptLine> = {
  desktop: {
    clipId: 'remind-desktop',
    text: 'Move your mouse up or down for yes, left or right for no.',
  },
  headset: {
    clipId: 'remind-headset',
    text: 'Nod your head for yes. Shake it for no.',
  },
  tilt: {
    clipId: 'remind-tilt',
    text: 'Tilt your phone forward or back for yes, left or right for no.',
  },
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
  NO_INPUT_LINES,
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
  readonly tiltSensor: boolean;
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
      toggleRecording: () => void;
      getRecording: () => {
        samples: Array<{ t: number; pitch: number; yaw: number; src: string }>;
        events: Array<{
          t: number;
          answer: YesNoAnswer;
          amplitudeDeg: number | null;
          src: string;
        }>;
      };
      recaptureBaseline: () => void;
      feedAngles: (pitchDeg: number, yawDeg: number) => void;
      feedFlatAngles: (pitchDeg: number, yawDeg: number) => void;
    };
  }
}

export class NodLabSystem extends createSystem({}) {
  private readonly detector = new HeadNodShakeDetector();
  // Flat-mode gestures must be true out-and-back swings: a one-way drag
  // toward the panel buttons never completes a cycle.
  private readonly flatDetector = new HeadNodShakeDetector(
    FLAT_HEAD_GESTURE_CONFIG,
  );
  private readonly pointerTracker = new PointerGestureTracker();
  private readonly tiltTracker = new TiltBaselineTracker();
  private tiltState: 'off' | 'on' | 'denied' = 'off';
  // Desktops expose DeviceOrientationEvent without a real sensor (events
  // carry null angles or never fire), so a granted/unneeded permission is
  // not evidence of a phone. Only actual sensor data is.
  private tiltSensorSeen = false;
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
  private lastResponseWasNoInput = false;
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
  // Owner's Nov 16 test-mode request: record gesture samples/answers for
  // tuning, re-anchor the baseline on demand, and flash the answer buttons
  // when a detection lands.
  private recording = false;
  private recStartedAt = 0;
  private recSamples: Array<{
    t: number;
    pitch: number;
    yaw: number;
    src: string;
  }> = [];
  private recEvents: Array<{
    t: number;
    answer: YesNoAnswer;
    amplitudeDeg: number | null;
    src: string;
  }> = [];
  private recordLabel: UIKit.Text | null = null;
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;
  private transientStatus: { text: string; until: number } | null = null;
  // Standalone diagnosis while recording (owner, Nov 16): detection must
  // run without waiting through story questions, so recording feeds shadow
  // detectors that report answers (flash + recorded event) without
  // advancing the dialogue. One per tuning because the config differs.
  private readonly recDetectorHeadset = new HeadNodShakeDetector(
    DEFAULT_HEAD_GESTURE_CONFIG,
  );
  private readonly recDetectorFlat = new HeadNodShakeDetector(
    FLAT_HEAD_GESTURE_CONFIG,
  );

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
    this.recordLabel = panel.getElementById<UIKit.Text>('nod-lab-record-label');
    panel
      .getElementById('nod-lab-record-button')
      ?.addEventListener('click', () => {
        // Phones gate orientation behind a per-gesture permission prompt;
        // like the Start tap, the Record tap is that gesture.
        unlockSpeechFromGesture();
        void this.setupTilt();
        this.toggleRecording();
      });
    panel
      .getElementById('nod-lab-reset-button')
      ?.addEventListener('click', () => this.recaptureBaseline());
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
      () => this.flatDetector.isEnabled || this.recording,
      (sample, now) => this.handleFlatAngles(sample, now, 'pointer'),
      () => this.flatDetector.reset(),
    );
    this.recDetectorHeadset.setEnabled(true);
    this.recDetectorFlat.setEnabled(true);

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
      toggleRecording: () => this.toggleRecording(),
      getRecording: () => ({
        samples: [...this.recSamples],
        events: [...this.recEvents],
      }),
      recaptureBaseline: () => this.recaptureBaseline(),
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
      if (this.recording) {
        this.recording = false;
        this.recordLabel?.setProperties({ text: 'Record gestures' });
      }
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
    // Settle the tilt permission (started on the Start tap) before the
    // intro line is chosen, so phones hear the tilt wording.
    await this.setupTilt();
    await this.playPrompt('intro');
  }

  private async playPrompt(
    promptId: string,
    advanceLoop = true,
  ): Promise<void> {
    const seq = ++this.sequence;
    const prompt = labPromptById(this.script, promptId);
    let line: LabScriptLine = prompt.line;
    if (promptId === 'intro') {
      const kind = this.deviceKind();
      if (kind === 'desktop') {
        line = INTRO_DESKTOP_LINE;
      } else if (kind === 'tilt') {
        line = INTRO_TILT_LINE;
      }
    }
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
    // The pointer tracker is fed even while not listening, so its baseline
    // already tracks the resting pointer; resetting it here would re-anchor
    // mid-swing for a user who started gesturing during the line. The tilt
    // tracker now feeds the same way (rest-pose tracking while still), so
    // it is left alone for the same reason.
    this.recDetectorHeadset.reset();
    this.recDetectorFlat.reset();
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
      () => this.flatDetector.isEnabled || this.recording,
      (sample, now) => this.handleFlatAngles(sample, now, 'tilt'),
    );
    await this.detectTiltSensor();
    this.renderPanel();
  }

  /**
   * Wait briefly for real orientation data before the lab treats the
   * device as a phone. Resolves on the first reading with actual angles;
   * on a desktop without a sensor the timeout expires instead.
   */
  private detectTiltSensor(timeoutMs = 800): Promise<void> {
    if (this.tiltSensorSeen) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const onOrientation = (event: Event) => {
        const orientation = event as DeviceOrientationEvent;
        if (orientation.beta != null || orientation.gamma != null) {
          this.tiltSensorSeen = true;
          window.removeEventListener('deviceorientation', onOrientation);
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        window.removeEventListener('deviceorientation', onOrientation);
        resolve();
      }, timeoutMs);
      window.addEventListener('deviceorientation', onOrientation);
    });
  }

  /** Tilt wording only when a real orientation sensor is delivering data. */
  private hasTiltInput(): boolean {
    return this.tiltState === 'on' && this.tiltSensorSeen;
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
    const seq = ++this.sequence;
    this.phase = 'responding';
    this.detector.setEnabled(false);
    this.flatDetector.setEnabled(false);
    this.noInputCount += 1;
    this.lastResponseWasNoInput = true;
    this.renderPanel();
    const noInputLines = this.script.noInput ?? NO_INPUT_LINES;
    const line =
      noInputLines[(this.noInputCount - 1) % noInputLines.length];
    await this.speakLine(line);
    if (seq !== this.sequence || !this.active) {
      return;
    }
    // Arm before the reminder, not after it: the no-input line ends with
    // "try again", the user's natural cue to move, so the answer window
    // must already be open while the short reminder plays. Arming only
    // after the reminder dropped every gesture made on that cue (owner's
    // Nov 14 desktop retest: nothing registered after "try again").
    this.armListening();
    await this.speakLine(this.remindLine());
    if (seq !== this.sequence || !this.active) {
      return;
    }
    // The reminder spoke over the armed window; restart the no-input clock
    // so the full timeout runs from when speech actually ends.
    this.listeningIdleMs = 0;
  }

  private deviceKind(): 'desktop' | 'headset' | 'tilt' {
    if (this.isImmersive()) {
      return 'headset';
    }
    return this.hasTiltInput() ? 'tilt' : 'desktop';
  }

  private remindLine(): LabScriptLine {
    return REMIND_LINES[this.deviceKind()];
  }

  private submitAnswer(
    answer: YesNoAnswer,
    source: 'gesture' | 'button' | 'key' | 'debug' | 'pointer' | 'tilt',
  ): void {
    if (!this.active || this.phase !== 'listening' || this.currentPrompt == null) {
      return;
    }
    if (this.recording) {
      this.recEvents.push({
        t: performance.now() / 1000 - this.recStartedAt,
        answer,
        amplitudeDeg: this.lastAmplitudeDeg,
        src: source,
      });
    }
    this.flashAnswerButton(answer);
    const prompt = this.currentPrompt;
    const seq = ++this.sequence;
    this.phase = 'responding';
    this.detector.setEnabled(false);
    this.lastAnswer = answer;
    this.lastResponseWasNoInput = false;
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
    if (this.recording) {
      this.recSamples.push({ t: now - this.recStartedAt, pitch: pitchDeg, yaw: yawDeg, src: 'headset' });
      this.feedRecordingDetector(pitchDeg, yawDeg, now, 'headset');
    }
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
    if (this.recording) {
      this.recSamples.push({ t: now - this.recStartedAt, pitch: sample.pitchDeg, yaw: sample.yawDeg, src: source });
      this.feedRecordingDetector(sample.pitchDeg, sample.yawDeg, now, source);
    }
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
    if (
      (this.phase === 'listening' || this.recording) &&
      this.isImmersive()
    ) {
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

  /** Caption shown for a line: always the spoken line's own text. */
  private displayCaption(line: LabScriptLine | null): string {
    return line?.text ?? '';
  }

  private activeGestureConfig(): HeadGestureConfig {
    return this.isImmersive()
      ? DEFAULT_HEAD_GESTURE_CONFIG
      : FLAT_HEAD_GESTURE_CONFIG;
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
        : this.hasTiltInput()
          ? 'Listening. Tilt forward/back for yes, left/right for no - or tap the buttons.'
          : 'Listening. Move your mouse up or down for yes, left or right for no - or use the buttons (Y/N).',
      responding: this.lastResponseWasNoInput
        ? 'No movement heard. Trying again.'
        : 'Answer received.',
      done: 'Link check complete. Cypher out.',
    };
    if (
      this.transientStatus != null &&
      performance.now() > this.transientStatus.until
    ) {
      this.transientStatus = null;
    }
    this.statusText?.setProperties({
      text: this.transientStatus?.text ?? overrideLine ?? statusByPhase[this.phase],
    });
    this.lineText?.setProperties({
      text: this.displayCaption(this.currentLine),
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
        `thresholds act ${(this.activeGestureConfig().activationRad * 180 / Math.PI).toFixed(0)} deg ` +
        `peak ${(this.activeGestureConfig().minPeakRad * 180 / Math.PI).toFixed(0)} deg` +
        (this.recording
          ? ` | REC ${this.recSamples.length} samples ${this.recEvents.length} answers`
          : ''),
    });
    this.voiceText?.setProperties({ text: this.voiceStatusLine() });
    this.startLabel?.setProperties({
      text: this.phase === 'done' ? 'Run link check again' : 'Open the link',
    });
  }

  /**
   * Owner's Nov 16 test button: starts/stops capturing angle samples and
   * detected answers for tuning. The recording lives in memory and on
   * __nodLabDebug.getRecording(); on stop it is also copied to the clipboard
   * where the platform allows it, so a phone tester can paste it into a
   * message.
   */
  private toggleRecording(): void {
    this.recording = !this.recording;
    if (this.recording) {
      this.recSamples = [];
      this.recEvents = [];
      this.recStartedAt = performance.now() / 1000;
      this.recDetectorHeadset.reset();
      this.recDetectorFlat.reset();
      // reset() does not re-enable, and a detector disables itself after
      // each reported event - without this only the first gesture of a
      // recording session would ever register (found live, Nov 16).
      this.recDetectorHeadset.setEnabled(true);
      this.recDetectorFlat.setEnabled(true);
      this.transientStatus = {
        text: 'Recording gestures. Nod or shake, then stop.',
        until: performance.now() + 2500,
      };
    } else {
      // The stop summary is always shown on the panel so it is readable on
      // every platform; the full trace is copied to the clipboard where the
      // browser allows it (desktop/phone https; XR browsers may refuse, in
      // which case the panel summary and __nodLabDebug are what we have).
      const summary =
        this.recEvents
          .map(
            (e) =>
              `${e.answer} ${e.amplitudeDeg == null ? '-' : e.amplitudeDeg.toFixed(1)} deg`,
          )
          .join(', ') || 'no detections';
      const payload = JSON.stringify({
        startedAt: this.recStartedAt,
        samples: this.recSamples,
        events: this.recEvents,
      });
      this.transientStatus = {
        text: `Recording stopped (${this.recSamples.length} samples): ${summary}`,
        until: performance.now() + 8000,
      };
      try {
        void navigator.clipboard?.writeText(payload).then(() => {
          this.transientStatus = {
            text: `Recording copied to clipboard (${this.recSamples.length} samples, ${this.recEvents.length} answers).`,
            until: performance.now() + 4000,
          };
          this.renderPanel();
        }, () => {});
      } catch {
        // Clipboard unavailable; the panel summary already shows the result.
      }
    }
    this.recordLabel?.setProperties({
      text: this.recording ? 'Stop recording' : 'Record gestures',
    });
    this.renderPanel();
  }

  /**
   * Owner's Nov 16 test button: re-anchor every baseline as if the question
   * had just been asked. Same arm path as a fresh prompt, plus the flat
   * trackers the arm path deliberately leaves alone (here the explicit ask
   * is a full re-anchor after the tester moved between questions).
   */
  private recaptureBaseline(): void {
    if (!this.active) {
      return;
    }
    this.player.head.getWorldQuaternion(this.baselineQuat);
    this.detector.reset();
    this.flatDetector.reset();
    this.pointerTracker.reset();
    this.tiltTracker.reset();
    this.recDetectorHeadset.reset();
    this.recDetectorFlat.reset();
    if (this.currentPrompt != null && this.phase === 'listening') {
      this.listeningIdleMs = 0;
      this.lastIdleTickAt = performance.now();
      this.detector.setEnabled(this.isImmersive());
      this.flatDetector.setEnabled(!this.isImmersive());
    }
    this.transientStatus = {
      text: 'Position reset. Gestures now measure from here.',
      until: performance.now() + 2500,
    };
    this.renderPanel();
  }

  /**
   * While recording outside a live answer window, detection runs on a
   * shadow detector so gestures register (flash + recorded event) without
   * needing a story question. While a prompt IS listening the normal path
   * reports through submitAnswer, so the shadow stays out to avoid
   * double-counting one gesture.
   */
  private feedRecordingDetector(
    pitchDeg: number,
    yawDeg: number,
    now: number,
    src: string,
  ): void {
    if (this.phase === 'listening' && this.currentPrompt != null) {
      return;
    }
    const recDetector = this.isImmersive()
      ? this.recDetectorHeadset
      : this.recDetectorFlat;
    const event = recDetector.feed(
      (pitchDeg * Math.PI) / 180,
      (yawDeg * Math.PI) / 180,
      now,
    );
    if (event != null) {
      this.recEvents.push({
        t: now - this.recStartedAt,
        answer: event.answer,
        amplitudeDeg: (event.amplitudeRad * 180) / Math.PI,
        src: `rec-${src}`,
      });
      this.flashAnswerButton(event.answer);
      // The detector disables itself when it reports; re-arm so the next
      // gesture in the same recording also registers (cooldown still
      // applies, so one physical nod cannot double-report).
      recDetector.setEnabled(true);
    }
  }

  /** Brief green (yes) / red (no) flash on the answer buttons (owner, Nov 16). */
  private flashAnswerButton(answer: YesNoAnswer): void {
    const button = this.panel?.getElementById(
      answer === 'yes' ? 'nod-lab-yes-button' : 'nod-lab-no-button',
    );
    if (button == null) {
      return;
    }
    if (this.flashTimeout != null) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
      this.restoreAnswerButtons();
    }
    button.setProperties({
      backgroundColor: answer === 'yes' ? 0x2e9e4f : 0xd33f2f,
    });
    this.flashTimeout = setTimeout(() => {
      this.flashTimeout = null;
      this.restoreAnswerButtons();
    }, 700);
  }

  private restoreAnswerButtons(): void {
    this.panel
      ?.getElementById('nod-lab-yes-button')
      ?.setProperties({ backgroundColor: 0xffffff });
    this.panel
      ?.getElementById('nod-lab-no-button')
      ?.setProperties({ backgroundColor: 0xffffff });
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
      tiltSensor: this.tiltSensorSeen,
      immersive: this.isImmersive(),
      voiceStatus: this.voiceStatusLine(),
      answerCount: this.answerCount,
      cueCount: this.cueCount,
      noInputCount: this.noInputCount,
      clipPlays: { ...this.clipPlays },
    };
  }
                        }
