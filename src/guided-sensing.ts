/**
 * Experimental, local-only breath and probable eye-closure sensing.
 *
 * WebXR exposes a combined gaze ray, not eyelid state. A missing gaze pose is
 * therefore only evidence for "probably closed" after a healthy gaze baseline.
 */
import { createSystem, UIKit, UIKitMLAsset, Vector3 } from "@iwsdk/core";

type EyeEstimate =
  | "waiting_for_xr"
  | "calibrating_gaze"
  | "open"
  | "blink_or_uncertain"
  | "probably_closed"
  | "unavailable";

type BreathEstimate =
  | "off"
  | "calibrating"
  | "inhale_estimate"
  | "exhale_estimate"
  | "quiet_or_uncertain";

type GazeFeatureStatus =
  | "waiting_for_xr"
  | "granted"
  | "not_granted"
  | "unknown";

const GAZE_BASELINE_SECONDS = 1;
const PROBABLY_CLOSED_SECONDS = 0.65;
const REOPEN_SECONDS = 0.2;
const BREATH_CALIBRATION_SECONDS = 3;

class MicrophoneEnergySensor {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private samples = new Float32Array(1024);

  async start(): Promise<void> {
    this.stop();
    this.context = new AudioContext();
    await this.context.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
      video: false,
    });
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.samples.length;
    this.analyser.smoothingTimeConstant = 0.45;
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
  }

  sampleRms(): number {
    if (this.analyser == null) {
      return 0;
    }
    this.analyser.getFloatTimeDomainData(this.samples);
    let sumSquares = 0;
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = this.samples[index] ?? 0;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / this.samples.length);
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.analyser?.disconnect();
    this.analyser = null;
    if (this.context != null) {
      void this.context.close();
    }
    this.context = null;
  }
}

function findGazeSource(session: XRSession): XRInputSource | null {
  for (const source of session.inputSources) {
    if (source.targetRayMode === "gaze") {
      return source;
    }
  }
  const trackedSources = (
    session as XRSession & { trackedSources?: readonly XRInputSource[] }
  ).trackedSources;
  for (const source of trackedSources ?? []) {
    if (source.targetRayMode === "gaze") {
      return source;
    }
  }
  return null;
}

export class GuidedSensingSystem extends createSystem({}) {
  private readonly microphone = new MicrophoneEnergySensor();
  private readonly headPosition = new Vector3();
  private monitoring = false;
  private microphoneAvailable = false;
  private startedAt = 0;
  private gazeValidSince = -1;
  private gazeInvalidSince = -1;
  private gazeRestoredSince = -1;
  private hasGazeBaseline = false;
  private eyeEstimate: EyeEstimate = "waiting_for_xr";
  private breathEstimate: BreathEstimate = "off";
  private noiseFloor = 0.002;
  private noiseSamples = 0;
  private previousHeadY = 0;
  private filteredHeadVelocity = 0;
  private lastUiUpdate = 0;
  private instructionPlayed = false;
  private breathAwaitingViewerPose = false;
  private requestInFlight = false;
  private renderSpatialStatus: (() => void) | null = null;
  private spatialButtonHovered = false;
  private calibrationButtonHovered = false;
  private gazeTestButtonHovered = false;
  private activeSession: XRSession | null = null;
  private lastSpatialActivationAt = -1;
  private lastGazeTestActivationAt = -1;
  private gazeFeatureStatus: GazeFeatureStatus = "waiting_for_xr";
  private gazeSourcePresent = false;
  private gazePoseValid = false;
  private pinchTestCount = 0;
  private gazeTestResult = "Look at the test button and pinch.";
  private breathCalibrationRequested = false;

  private readonly startButton = document.querySelector<HTMLButtonElement>(
    "#start-guided-sensing",
  );
  private readonly eyeOutput =
    document.querySelector<HTMLOutputElement>("#eye-estimate");
  private readonly breathOutput =
    document.querySelector<HTMLOutputElement>("#breath-estimate");
  private readonly sensorOutput =
    document.querySelector<HTMLOutputElement>("#sensor-status");

  init(): void {
    const toggle = () => this.toggleMonitoring();
    const markSpatialHover = () => {
      this.spatialButtonHovered = true;
    };
    const clearSpatialHover = () => {
      this.spatialButtonHovered = false;
    };

    const panel = this.world.requireSceneObject<UIKitMLAsset>("welcome-panel");
    const spatialButton = panel.requireElementById("guided-sensing-button");
    const spatialButtonLabel = panel.requireElementById<UIKit.Text>(
      "guided-sensing-button-label",
    );
    const spatialEyeOutput = panel.requireElementById<UIKit.Text>(
      "spatial-eye-status",
    );
    const spatialBreathOutput = panel.requireElementById<UIKit.Text>(
      "spatial-breath-status",
    );
    const spatialSensorOutput = panel.requireElementById<UIKit.Text>(
      "spatial-sensor-status",
    );
    const calibrationButton = panel.requireElementById(
      "breath-calibration-button",
    );
    const calibrationButtonLabel = panel.requireElementById<UIKit.Text>(
      "breath-calibration-button-label",
    );
    const markCalibrationHover = () => {
      this.calibrationButtonHovered = true;
    };
    const clearCalibrationHover = () => {
      this.calibrationButtonHovered = false;
    };
    const calibrate = () => this.requestBreathCalibration();

    const debugPanel =
      this.world.requireSceneObject<UIKitMLAsset>("gaze-debug-panel");
    const gazeTestButton = debugPanel.requireElementById(
      "gaze-pinch-test-button",
    );
    const gazeFeatureOutput = debugPanel.requireElementById<UIKit.Text>(
      "gaze-feature-status",
    );
    const gazeSourceOutput = debugPanel.requireElementById<UIKit.Text>(
      "gaze-source-status",
    );
    const gazePoseOutput = debugPanel.requireElementById<UIKit.Text>(
      "gaze-pose-status",
    );
    const gazePinchOutput = debugPanel.requireElementById<UIKit.Text>(
      "gaze-pinch-count",
    );
    const gazeTestResultOutput = debugPanel.requireElementById<UIKit.Text>(
      "gaze-test-result",
    );
    const markGazeTestHover = () => {
      this.gazeTestButtonHovered = true;
    };
    const clearGazeTestHover = () => {
      this.gazeTestButtonHovered = false;
    };
    const runGazeTest = () => this.runGazePinchTest();
    spatialButton.name = "Btn_GuidedSensing";
    spatialButton.addEventListener("click", toggle);
    spatialButton.addEventListener("pointerenter", markSpatialHover);
    spatialButton.addEventListener("pointerleave", clearSpatialHover);
    calibrationButton.name = "Btn_BreathCalibration";
    calibrationButton.addEventListener("click", calibrate);
    calibrationButton.addEventListener("pointerenter", markCalibrationHover);
    calibrationButton.addEventListener("pointerleave", clearCalibrationHover);
    gazeTestButton.name = "Btn_GazePinchTest";
    gazeTestButton.addEventListener("click", runGazeTest);
    gazeTestButton.addEventListener("pointerenter", markGazeTestHover);
    gazeTestButton.addEventListener("pointerleave", clearGazeTestHover);
    this.renderSpatialStatus = () => {
      spatialButtonLabel.setProperties({
        text: this.monitoring ? "Stop sensing" : "Start guided sensing",
      });
      spatialEyeOutput.setProperties({
        text: this.eyeEstimate.replace(/_/gu, " "),
      });
      spatialBreathOutput.setProperties({
        text: this.breathEstimate.replace(/_/gu, " "),
      });
      spatialSensorOutput.setProperties({
        text: this.sensorOutput?.value || "Sensors stopped",
      });
      calibrationButtonLabel.setProperties({
        text: this.breathCalibrationRequested
          ? "Calibrating..."
          : "Calibrate breathing",
      });
      gazeFeatureOutput.setProperties({
        text: this.gazeFeatureStatus.replace(/_/gu, " "),
      });
      gazeSourceOutput.setProperties({
        text: this.gazeSourcePresent ? "present" : "missing",
      });
      gazePoseOutput.setProperties({
        text: this.gazePoseValid ? "valid" : "invalid",
      });
      gazePinchOutput.setProperties({ text: String(this.pinchTestCount) });
      gazeTestResultOutput.setProperties({ text: this.gazeTestResult });
    };

    this.startButton?.addEventListener("click", toggle);
    this.cleanupFuncs.push(() => {
      this.startButton?.removeEventListener("click", toggle);
      spatialButton.removeEventListener("click", toggle);
      spatialButton.removeEventListener("pointerenter", markSpatialHover);
      spatialButton.removeEventListener("pointerleave", clearSpatialHover);
      calibrationButton.removeEventListener("click", calibrate);
      calibrationButton.removeEventListener("pointerenter", markCalibrationHover);
      calibrationButton.removeEventListener("pointerleave", clearCalibrationHover);
      gazeTestButton.removeEventListener("click", runGazeTest);
      gazeTestButton.removeEventListener("pointerenter", markGazeTestHover);
      gazeTestButton.removeEventListener("pointerleave", clearGazeTestHover);
      this.setActiveSession(null);
      this.stopMonitoring();
    });
    this.renderStatus();
  }

  update(delta: number): void {
    this.setActiveSession(this.xrManager.getSession());
    const now = performance.now() / 1000;
    this.updateEyeEstimate(now);
    if (this.monitoring) {
      this.updateBreathEstimate(delta, now);
    }
    if (now - this.lastUiUpdate >= 0.1) {
      this.lastUiUpdate = now;
      this.renderStatus();
    }
  }

  private toggleMonitoring(): void {
    const now = performance.now();
    if (this.requestInFlight || now - this.lastSpatialActivationAt < 300) {
      return;
    }
    this.lastSpatialActivationAt = now;
    if (this.monitoring) {
      this.stopMonitoring();
    } else {
      void this.startMonitoring();
    }
  }

  private readonly onXrSelect = (event: XRInputSourceEvent): void => {
    const selectionSource = event.inputSource;
    const isGazeOrHand =
      selectionSource.targetRayMode === "gaze" || selectionSource.hand != null;
    if (!isGazeOrHand) {
      return;
    }
    if (this.gazeTestButtonHovered) {
      this.runGazePinchTest();
    } else if (this.calibrationButtonHovered) {
      this.requestBreathCalibration();
    } else if (this.spatialButtonHovered) {
      this.toggleMonitoring();
    }
  };

  private runGazePinchTest(): void {
    const now = performance.now();
    if (now - this.lastGazeTestActivationAt < 300) {
      return;
    }
    this.lastGazeTestActivationAt = now;
    if (this.gazeFeatureStatus === "granted" && this.gazePoseValid) {
      this.pinchTestCount += 1;
      this.gazeTestResult = "PASS: gaze target + pinch received";
    } else {
      this.gazeTestResult = "FAIL: no valid gaze pose at pinch";
    }
    this.renderStatus();
  }

  private requestBreathCalibration(): void {
    if (!this.monitoring) {
      this.setSensorStatus("Start sensing before breathing calibration");
      return;
    }
    this.breathCalibrationRequested = true;
    this.breathAwaitingViewerPose = true;
    this.breathEstimate = "calibrating";
    this.setSensorStatus("Breathing calibration: breathe normally for 3 seconds");
    this.speak("Breathe normally while calibration runs.");
  }

  private setActiveSession(session: XRSession | null): void {
    if (session === this.activeSession) {
      return;
    }
    this.activeSession?.removeEventListener("select", this.onXrSelect);
    this.activeSession = session;
    this.activeSession?.addEventListener("select", this.onXrSelect);
  }

  private async startMonitoring(): Promise<void> {
    this.requestInFlight = true;
    if (this.startButton != null) {
      this.startButton.disabled = true;
    }
    this.setSensorStatus("Requesting microphone permission...");
    try {
      await this.microphone.start();
      this.microphoneAvailable = true;
      this.armMonitoring();
      this.setSensorStatus("Sensors armed; establish a steady gaze");
    } catch (error) {
      console.warn("[guided-sensing] microphone unavailable", error);
      this.microphoneAvailable = false;
      this.armMonitoring();
      this.setSensorStatus(
        "Microphone unavailable; gaze cues and head-motion estimate remain active",
      );
    } finally {
      this.requestInFlight = false;
      if (this.startButton != null) {
        this.startButton.disabled = false;
      }
      this.renderStatus();
    }
  }

  private stopMonitoring(): void {
    this.monitoring = false;
    this.microphoneAvailable = false;
    this.instructionPlayed = false;
    this.microphone.stop();
    globalThis.speechSynthesis?.cancel();
    this.breathEstimate = "off";
    if (this.startButton != null) {
      this.startButton.disabled = false;
      this.startButton.textContent = "Start guided sensing";
    }
    this.setSensorStatus("Sensors stopped");
  }

  private armMonitoring(): void {
    this.monitoring = true;
    this.startedAt = performance.now() / 1000;
    this.noiseFloor = 0.002;
    this.noiseSamples = 0;
    this.player.head.getWorldPosition(this.headPosition);
    this.previousHeadY = this.headPosition.y;
    this.filteredHeadVelocity = 0;
    this.instructionPlayed = false;
    this.breathAwaitingViewerPose = true;
    this.breathEstimate = "calibrating";
    if (this.startButton != null) {
      this.startButton.textContent = "Stop sensing";
    }
    this.playMonitoringInstructionIfNeeded();
  }

  private updateEyeEstimate(now: number): void {
    const session = this.xrManager.getSession();
    const frame = this.xrManager.getFrame();
    const referenceSpace = this.xrManager.getReferenceSpace();
    if (
      session == null ||
      frame == null ||
      referenceSpace == null ||
      session.visibilityState !== "visible"
    ) {
      this.gazeFeatureStatus = "waiting_for_xr";
      this.gazeSourcePresent = false;
      this.gazePoseValid = false;
      this.resetGazeTracking("waiting_for_xr");
      return;
    }

    const enabledFeatures = (
      session as XRSession & { enabledFeatures?: readonly string[] }
    ).enabledFeatures;
    this.gazeFeatureStatus =
      enabledFeatures == null
        ? "unknown"
        : enabledFeatures.includes("gaze-tracking") ||
            enabledFeatures.includes("eye-tracking")
          ? "granted"
          : "not_granted";

    const viewerPose = frame.getViewerPose(referenceSpace);
    if (viewerPose == null) {
      this.gazeSourcePresent = false;
      this.gazePoseValid = false;
      this.resetGazeTracking("unavailable");
      return;
    }

    const gazeSource = findGazeSource(session);
    this.gazeSourcePresent = gazeSource != null;
    let gazeValid = false;
    if (gazeSource != null) {
      try {
        gazeValid =
          frame.getPose(gazeSource.targetRaySpace, referenceSpace) != null;
      } catch (error) {
        console.warn("[guided-sensing] unable to sample gaze pose", error);
      }
    }
    this.gazePoseValid = gazeValid;

    if (gazeValid) {
      this.gazeInvalidSince = -1;
      if (this.gazeValidSince < 0) {
        this.gazeValidSince = now;
      }
      if (!this.hasGazeBaseline) {
        this.eyeEstimate = "calibrating_gaze";
        if (now - this.gazeValidSince >= GAZE_BASELINE_SECONDS) {
          this.hasGazeBaseline = true;
          this.eyeEstimate = "open";
          this.playMonitoringInstructionIfNeeded();
        }
        return;
      }

      if (this.eyeEstimate === "probably_closed") {
        if (this.gazeRestoredSince < 0) {
          this.gazeRestoredSince = now;
        }
        if (now - this.gazeRestoredSince >= REOPEN_SECONDS) {
          this.eyeEstimate = "open";
          this.playTransitionTone("open");
        }
      } else {
        this.gazeRestoredSince = -1;
        this.eyeEstimate = "open";
      }
      return;
    }

    this.gazeValidSince = -1;
    this.gazeRestoredSince = -1;
    if (!this.hasGazeBaseline) {
      this.eyeEstimate = gazeSource == null ? "unavailable" : "calibrating_gaze";
      return;
    }
    if (this.gazeInvalidSince < 0) {
      this.gazeInvalidSince = now;
    }
    const invalidFor = now - this.gazeInvalidSince;
    if (invalidFor >= PROBABLY_CLOSED_SECONDS) {
      if (this.eyeEstimate !== "probably_closed") {
        this.eyeEstimate = "probably_closed";
        if (this.monitoring) {
          this.playTransitionTone("closed");
        }
      }
    } else if (this.eyeEstimate !== "probably_closed") {
      this.eyeEstimate = "blink_or_uncertain";
    }
  }

  private updateBreathEstimate(delta: number, now: number): void {
    if (!this.viewerPoseReadyForBreath()) {
      this.breathAwaitingViewerPose = true;
      this.breathEstimate = "calibrating";
      return;
    }
    if (this.breathAwaitingViewerPose) {
      this.breathAwaitingViewerPose = false;
      this.startedAt = now;
      this.noiseFloor = 0.002;
      this.noiseSamples = 0;
      this.player.head.getWorldPosition(this.headPosition);
      this.previousHeadY = this.headPosition.y;
      this.filteredHeadVelocity = 0;
    }

    const rms = this.microphone.sampleRms();
    this.player.head.getWorldPosition(this.headPosition);
    const safeDelta = Math.max(delta, 1 / 120);
    const headVelocity = (this.headPosition.y - this.previousHeadY) / safeDelta;
    this.previousHeadY = this.headPosition.y;
    this.filteredHeadVelocity +=
      (headVelocity - this.filteredHeadVelocity) * Math.min(1, safeDelta * 3);

    if (now - this.startedAt < BREATH_CALIBRATION_SECONDS) {
      this.noiseSamples += 1;
      this.noiseFloor += (rms - this.noiseFloor) / this.noiseSamples;
      this.breathEstimate = "calibrating";
      return;
    }

    if (this.breathCalibrationRequested) {
      this.breathCalibrationRequested = false;
      this.setSensorStatus("Breathing baseline captured; guided inhale/exhale comes next");
      this.speak("Calibration complete.");
    }

    const airflowActive = rms > Math.max(0.004, this.noiseFloor * 1.8);
    const motionThreshold = 0.0025;
    const motionMagnitude = Math.abs(this.filteredHeadVelocity);
    const motionActive = motionMagnitude >= motionThreshold;
    if (!airflowActive && !motionActive) {
      this.breathEstimate = "quiet_or_uncertain";
    } else if (motionActive && (!this.microphoneAvailable || airflowActive)) {
      if (this.filteredHeadVelocity > motionThreshold) {
        this.breathEstimate = "inhale_estimate";
      } else {
        this.breathEstimate = "exhale_estimate";
      }
    } else {
      this.breathEstimate = "quiet_or_uncertain";
    }
  }

  private viewerPoseReadyForBreath(): boolean {
    const session = this.xrManager.getSession();
    const frame = this.xrManager.getFrame();
    const referenceSpace = this.xrManager.getReferenceSpace();
    if (
      session == null ||
      frame == null ||
      referenceSpace == null ||
      session.visibilityState !== "visible"
    ) {
      return false;
    }
    return frame.getViewerPose(referenceSpace) != null;
  }

  private playMonitoringInstructionIfNeeded(): void {
    if (!this.monitoring || this.instructionPlayed || !this.hasGazeBaseline) {
      return;
    }
    this.instructionPlayed = true;
    this.speak("Take a slow breath, then close your eyes.");
    this.setSensorStatus(
      this.microphoneAvailable
        ? "Gaze established; listening for breath and gaze loss"
        : "Gaze established; microphone unavailable, using head motion only",
    );
  }

  private resetGazeTracking(state: EyeEstimate): void {
    this.gazeValidSince = -1;
    this.gazeInvalidSince = -1;
    this.gazeRestoredSince = -1;
    this.hasGazeBaseline = false;
    this.eyeEstimate = state;
  }

  private playTransitionTone(kind: "closed" | "open"): void {
    const context = this.microphone.audioContext;
    if (context == null) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    const startFrequency = kind === "closed" ? 392 : 523.25;
    const endFrequency = kind === "closed" ? 261.63 : 783.99;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      start + 0.32,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.45);
    console.info(`[guided-sensing] ${kind} cue played`);
  }

  private speak(message: string): void {
    if (!("speechSynthesis" in globalThis)) {
      return;
    }
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.88;
    utterance.pitch = 0.92;
    globalThis.speechSynthesis.speak(utterance);
    console.info(`[guided-sensing] instruction spoken: ${message}`);
  }

  private renderStatus(): void {
    if (this.eyeOutput != null) {
      this.eyeOutput.value = this.eyeEstimate.replace(/_/gu, " ");
      this.eyeOutput.dataset.state = this.eyeEstimate;
    }
    if (this.breathOutput != null) {
      this.breathOutput.value = this.breathEstimate.replace(/_/gu, " ");
      this.breathOutput.dataset.state = this.breathEstimate;
    }
    this.renderSpatialStatus?.();
  }

  private setSensorStatus(message: string): void {
    if (this.sensorOutput != null) {
      this.sensorOutput.value = message;
    }
    this.renderSpatialStatus?.();
  }
}
