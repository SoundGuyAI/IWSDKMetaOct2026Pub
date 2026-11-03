import {
  Hovered,
  Pressed,
  Quaternion,
  RayInteractable,
  Transform,
  UIKit,
  Visibility,
  UIKitMLAsset,
  VisibilityState,
  Vector3,
  XRAnchor,
  XRMesh,
  XRPlane,
  createSystem,
  type Entity,
} from '@iwsdk/core';
import { XRHandVisualAdapter } from '@iwsdk/xr-input';
import type { ExperienceMode } from '../app-mode.js';
import { playErrorTone, playPadTone, playPadToneFromUserAction, primeWallTonesAudioFromGesture, suspendAudioContext, needsExplicitMobileSoundUnlock, isHtmlAudioPoolUnlocked } from './audio.js';
import {
  AIR_GHOST_HAND_OFFSET_M,
  AIR_GHOST_MIN_HEAD_DISTANCE_M,
  AIR_ORIENT_SLERP,
  AIR_ORIENT_SNAP_FLAT,
  AIR_ORIENT_SNAP_UPRIGHT,
  AIR_PLACE_ROOM_PAD_SIZE_M,
  AIR_PLACE_SITTING_PAD_SIZE_M,
  HEADSET_PAD_SIZE_M,
  NOTE_GAP_S,
  BETWEEN_ROUNDS_DELAY_S,
  IDLE_REPLAY_S,
  POST_INTRO_DELAY_S,
  SCAN_WAIT_S,
  TOUCH_BOX_DEPTH_M,
  TOUCH_CENTER_PAD_MARGIN_M,
  TOUCH_ENTER_FRAMES,
  TOUCH_EXIT_FRAMES,
  TOUCH_TIP_GRIP_MAX_M,
  WALL_TONE_PADS,
  WRONG_RESET_DELAY_S,
  type WallTonePadId,
} from './constants.js';
import {
  collectTablePlanes,
  collectVerticalWalls,
  generateTablePadCandidates,
  generateWallPadCandidates,
  planDesktopGridFromCamera,
  type PlacedPadTransform,
} from './plane-placement.js';
import {
  createGhostPadRuntime,
  createPadRuntime,
  defaultDesktopPadSize,
  defaultHeadsetPadSize,
  disposePadRuntimes,
  flashPad,
  solidifyGhostPad,
  type PadRuntime,
} from './pads.js';
import {
  applyRoomSetupTints,
  clearRoomSetupTints,
  createSlotCandidateRuntime,
  createWallOverlay,
  disposeSlotCandidates,
  setCandidateVisualState,
  type SlotCandidateRuntime,
} from './room-setup-visuals.js';
import { WallTonesSequence } from './sequence.js';
import { WALL_TONES_SPEECH, WallTonesSpeech, unlockSpeechFromGesture, resetSpeechUnlock } from './speech.js';
import {
  getActiveWorldKind,
  switchBackToHubMenu,
  switchToWallTonesArWorld,
} from './world-host.js';
import { WallSlotCandidate } from './wall-slot-candidate-component.js';
import { WallTonePad } from './wall-tone-pad-component.js';

const FLAT_BACKDROP_NODE_IDS = [
  'studio-floor',
  'stage',
  'gallery-set',
  'sideboard-set',
  'key-light',
  'fill-light',
] as const;

type WallTonesDebugBridge = {
  phase: string;
  flowPhase: string;
  sequence: readonly number[];
  inputStep: number;
  streak: number;
  bestStreak: number;
  flatAwaitingStart: boolean;
  slotCandidateCount: number;
  selectedSlotCount: number;
  submitPad: (padIndex: number) => void;
  /** Emulator helper: spawn 4 ray-pickable wall slots in front of the player. */
  startFakeWallPick: () => void;
  selectSlot: (candidateIndex: number) => void;
};

declare global {
  interface Window {
    __wallTonesDebug?: WallTonesDebugBridge;
  }
}

type SetupMode = 'room-scale' | 'sitting' | 'air';
type AirOrientation = 'vertical' | 'horizontal';

type FlowPhase =
  | 'inactive'
  | 'choose-mode'
  | 'scanning'
  | 'wall-picking'
  | 'air-placement'
  | 'playing';

export class WallTonesSystem extends createSystem({
  pads: { required: [WallTonePad] },
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
  padHovered: { required: [WallTonePad, Hovered] },
  padPressed: { required: [WallTonePad, Pressed] },
  slotHovered: { required: [WallSlotCandidate, Hovered] },
  slotPressed: { required: [WallSlotCandidate, Pressed] },
}) {
  private readonly speech = new WallTonesSpeech();
  private readonly game = new WallTonesSequence();
  private readonly viewer = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly cameraPosition = new Vector3();
  private readonly tipLeft = new Vector3();
  private readonly tipRight = new Vector3();
  private readonly tipLocal = new Vector3();
  private readonly gripWorld = new Vector3();
  private readonly ghostForward = new Vector3();
  private readonly ghostTarget = new Vector3();
  private readonly awayFromHead = new Vector3();
  private readonly handUp = new Vector3();
  private readonly handForward = new Vector3();
  private readonly gripQuat = new Quaternion();
  private readonly ghostQuat = new Quaternion();
  private readonly targetGhostQuat = new Quaternion();
  private readonly scratchQuat = new Quaternion();
  private readonly padWorldPos = new Vector3();
  private readonly tipScratch = new Vector3();
  private readonly rayOrigin = new Vector3();
  private readonly rayDir = new Vector3();
  private readonly rayToSlot = new Vector3();
  private readonly rayClosest = new Vector3();
  private readonly axisX = new Vector3(1, 0, 0);

  private experienceActive = false;
  private flowPhase: FlowPhase = 'inactive';
  private setupMode: SetupMode | null = null;
  private pads: PadRuntime[] = [];
  private playbackQueue: Promise<void> = Promise.resolve();
  private scanStartedAt = -1;
  private airPlaceStep = 0;
  private airPadSizeM = AIR_PLACE_ROOM_PAD_SIZE_M;
  private ghostPad: PadRuntime | null = null;
  private statusText = '';
  private panelBound = false;
  private flatBackdropHidden = false;
  private wasNonImmersive = true;
  private flatAwaitingStart = false;
  /** After playback, ignore touches until every pad is clear (avoids stuck finger auto-hitting). */
  private inputNeedsClear = false;
  private airOrientation: AirOrientation = 'vertical';
  /** When set, panel lock overrides hand-driven snap. */
  private airOrientationLocked: AirOrientation | null = null;
  private dominantHand: 'left' | 'right' | null = null;
  private lastInputAt = 0;
  private idleReplayQueued = false;
  private panelRayRemoved = false;
  private lackingSpatialData = false;
  private slotCandidates: SlotCandidateRuntime[] = [];
  private wallOverlayEntities: Entity[] = [];
  private selectedSlotTransforms: PlacedPadTransform[] = [];
  private readonly slotArmed = new Map<number, boolean>();
  private slotSelectLatched = false;
  private readonly touchEnterFrames = new Map<number, number>();
  private readonly touchExitFrames = new Map<number, number>();
  private pointerAudioBound = false;
  private mobileSoundButton: HTMLButtonElement | null = null;
  private mediaUnlockApplied = false;
  private readonly onPointerDownForAudio = (): void => {
    if (needsExplicitMobileSoundUnlock() && !isHtmlAudioPoolUnlocked()) {
      this.applyUserGestureMediaUnlock(false);
      return;
    }
    primeWallTonesAudioFromGesture();
  };
  private readonly savedPanelPosition = new Float32Array(3);
  private readonly savedPanelScale = new Float32Array(3);
  private panelPositionSaved = false;

  init(): void {
    this.bindPanelIfNeeded();
    const onModeChange = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: ExperienceMode }>).detail.mode;
      if (mode === 'walltones') {
        void this.enterWallTonesMode();
      } else {
        void this.leaveWallTonesMode();
      }
    };
    window.addEventListener('experience-mode-changed', onModeChange);
    this.wasNonImmersive =
      this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.onVisibilityForFlatPlay(state);
      }),
    );
    this.publishDebugBridge();
    this.cleanupFuncs.push(() => {
      window.removeEventListener('experience-mode-changed', onModeChange);
      delete window.__wallTonesDebug;
      void this.leaveWallTonesMode();
    });

    const stored = sessionStorage.getItem('iwsdk-experience-mode');
    if (stored === 'walltones') {
      void this.enterWallTonesMode();
    }
    const awaitingMode = sessionStorage.getItem('wall-tones-awaiting-mode');
    if (awaitingMode === '1' && getActiveWorldKind() === 'walltones-ar') {
      sessionStorage.removeItem('wall-tones-awaiting-mode');
      this.experienceActive = true;
      document.title = 'Wall Tones';
      this.bindPanelIfNeeded();
      this.flowPhase = 'choose-mode';
      this.setFlatHintVisible(false);
      this.setSetupUiVisible(true);
      this.statusText = 'Choose room scale or sitting.';
      this.speech.speak(WALL_TONES_SPEECH.chooseMode);
      this.renderPanel();
    }

    const pendingSetup = sessionStorage.getItem('wall-tones-setup-mode');
    if (
      pendingSetup === 'room-scale' ||
      pendingSetup === 'sitting' ||
      pendingSetup === 'air'
    ) {
      sessionStorage.removeItem('wall-tones-setup-mode');
      this.setupMode = pendingSetup;
      this.experienceActive = true;
      document.title = 'Wall Tones';
      const storedHand = sessionStorage.getItem('wall-tones-dominant-hand');
      if (storedHand === 'left' || storedHand === 'right') {
        this.dominantHand = storedHand;
      }
      this.bindPanelIfNeeded();
      this.setFlatHintVisible(false);
      this.setSetupUiVisible(false);
      if (pendingSetup === 'air') {
        this.startAirPlacement(WALL_TONES_SPEECH.chooseAirMenu);
      } else {
        this.flowPhase = 'scanning';
        this.scanStartedAt = performance.now() / 1000;
        this.speech.speak(WALL_TONES_SPEECH.lookAround);
      }
    }
  }

  update(delta: number): void {
    if (!this.experienceActive) {
      return;
    }
    this.bindPanelIfNeeded();
    if (!this.useDesktopPath()) {
      this.noteDominantHandFromInput();
    }
    if (
      this.useDesktopPath() &&
      this.flowPhase === 'playing' &&
      this.pads.length === 0
    ) {
      this.spawnDesktopPads();
      if (this.game.phase === 'idle') {
        this.flatAwaitingStart = true;
        this.statusText = 'Tap any pad to start (sound on)';
      }
    }
    if (this.flowPhase === 'scanning') {
      this.tickScan(delta);
    }
    if (this.flowPhase === 'wall-picking') {
      this.tickWallPicking();
    }
    if (this.flowPhase === 'air-placement') {
      this.tickAirPlacement(delta);
    }
    if (this.useDesktopInput()) {
      if (this.flatAwaitingStart || this.game.phase === 'input') {
        this.readDesktopTouches();
      }
    } else if (this.game.phase === 'input') {
      this.readFingertipTouches();
    }
    this.tickIdleReplay();
  }

  /** First pinch / trigger that selects UI or places becomes the orientation hand. */
  private noteDominantHandFromInput(): void {
    if (this.dominantHand != null) {
      return;
    }
    const stored = sessionStorage.getItem('wall-tones-dominant-hand');
    if (stored === 'left' || stored === 'right') {
      this.dominantHand = stored;
      return;
    }
    for (const hand of ['right', 'left'] as const) {
      if (this.input.xr.getSelectState(hand).start) {
        this.dominantHand = hand;
        sessionStorage.setItem('wall-tones-dominant-hand', hand);
        return;
      }
    }
  }

  private bindPanelIfNeeded(): void {
    if (this.panelBound) {
      return;
    }
    const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
    if (panel == null) {
      return;
    }
    this.panelBound = true;
    panel.getElementById('back-to-menu-button')?.addEventListener('click', () => {
      void this.onBackToMenu();
    });
    panel
      .getElementById('mode-room-scale-button')
      ?.addEventListener('click', () => void this.onChooseSetup('room-scale'));
    panel
      .getElementById('mode-sitting-button')
      ?.addEventListener('click', () => void this.onChooseSetup('sitting'));
    panel
      .getElementById('mode-air-place-button')
      ?.addEventListener('click', () => void this.onChooseSetup('air'));
    panel
      .getElementById('orient-vertical-button')
      ?.addEventListener('click', () => this.setAirOrientation('vertical'));
    panel
      .getElementById('orient-horizontal-button')
      ?.addEventListener('click', () => this.setAirOrientation('horizontal'));
    panel
      .getElementById('repeat-pattern-button')
      ?.addEventListener('click', () => void this.onRepeatPattern());
    panel
      .getElementById('rescan-room-button')
      ?.addEventListener('click', () => void this.onRescanRoom());
    if (this.experienceActive && this.useDesktopPath()) {
      this.setSetupUiVisible(false);
    }
    this.renderPanel();
  }

  private async enterWallTonesMode(): Promise<void> {
    if (this.experienceActive) {
      return;
    }
    this.experienceActive = true;
    this.game.resetAllScores();
    document.title = 'Wall Tones';
    this.bindPanelIfNeeded();
    this.bindPointerAudioUnlock();

    if (this.useDesktopPath()) {
      this.beginFlatPlay();
      return;
    }

    // Switch to the AR/passthrough world once up front so choosing Room scale
    // does not tear down XR mid-session (that felt like leaving the app).
    if (getActiveWorldKind() === 'hub-vr') {
      sessionStorage.setItem('wall-tones-awaiting-mode', '1');
      sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
      this.statusText = 'Opening passthrough…';
      this.renderPanel();
      await switchToWallTonesArWorld();
      return;
    }

    this.flowPhase = 'choose-mode';
    this.setFlatHintVisible(false);
    this.setSetupUiVisible(true);
    this.statusText = 'Choose room scale or sitting.';
    this.speech.speak(WALL_TONES_SPEECH.chooseMode);
    this.renderPanel();
  }

  private async leaveWallTonesMode(): Promise<void> {
    if (!this.experienceActive) {
      return;
    }
    this.experienceActive = false;
    this.flowPhase = 'inactive';
    this.flatAwaitingStart = false;
    this.inputNeedsClear = false;
    this.mediaUnlockApplied = false;
    this.airOrientationLocked = null;
    this.dominantHand = null;
    sessionStorage.removeItem('wall-tones-dominant-hand');
    sessionStorage.removeItem('wall-tones-awaiting-mode');
    this.lackingSpatialData = false;
    this.touchEnterFrames.clear();
    this.touchExitFrames.clear();
    this.playbackQueue = Promise.resolve();
    this.game.phase = 'idle';
    this.game.resetAllScores();
    this.speech.cancel();
    suspendAudioContext();
    resetSpeechUnlock();
    this.unbindPointerAudioUnlock();
    this.hideMobileSoundOverlay();
    this.clearRoomSetupVisuals();
    this.clearPads();
    this.ghostPad = null;
    this.setupMode = null;
    this.setFlatHintVisible(false);
    this.setWallPickHintVisible(false);
    this.setAirOrientUiVisible(false);
    this.setRescanUiVisible(false);
    this.restorePanelLayout();
    this.restorePanelPointerCapture();
    this.showStudioBackdrop();
    this.renderPanel();
  }

  private beginFlatPlay(): void {
    this.flowPhase = 'playing';
    this.flatAwaitingStart = true;
    this.statusText = 'Tap any pad to start (sound on)';
    this.setSetupUiVisible(false);
    this.setAirOrientUiVisible(false);
    this.setFlatHintVisible(true);
    this.hideStudioBackdrop();
    this.layoutPanelForFlatPlay();
    // Keep RayInteractable so Back / Repeat stay clickable; panel sits beside the pads.
    this.restorePanelPointerCapture();
    this.bindPointerAudioUnlock();
    this.spawnDesktopPads();
    this.setRepeatUiVisible(true);
    if (needsExplicitMobileSoundUnlock() && !isHtmlAudioPoolUnlocked()) {
      this.statusText = 'Tap “Sound on” below, then any pad';
      this.showMobileSoundOverlay();
    } else {
      this.statusText = 'Tap any pad to start (sound on)';
    }
    this.renderPanel();
  }

  private applyUserGestureMediaUnlock(speakLine: boolean): void {
    if (this.mediaUnlockApplied && isHtmlAudioPoolUnlocked()) {
      return;
    }
    this.mediaUnlockApplied = true;
    primeWallTonesAudioFromGesture();
    unlockSpeechFromGesture();
    this.hideMobileSoundOverlay();
    if (speakLine) {
      this.speech.speak(WALL_TONES_SPEECH.soundReady);
    }
    if (this.flatAwaitingStart) {
      this.statusText = 'Tap any pad to start';
    }
    this.renderPanel();
  }

  private showMobileSoundOverlay(): void {
    if (!needsExplicitMobileSoundUnlock()) {
      return;
    }
    if (this.mobileSoundButton == null) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Sound on — tap here';
      button.id = 'wall-tones-mobile-sound';
      Object.assign(button.style, {
        position: 'fixed',
        left: '50%',
        bottom: 'max(24px, env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        zIndex: '99999',
        fontSize: '18px',
        padding: '14px 22px',
        borderRadius: '12px',
        border: 'none',
        background: '#f5d90a',
        color: '#1c1d20',
        fontWeight: '700',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.applyUserGestureMediaUnlock(true);
      });
      document.body.appendChild(button);
      this.mobileSoundButton = button;
    }
    this.mobileSoundButton.style.display = 'block';
  }

  private hideMobileSoundOverlay(): void {
    if (this.mobileSoundButton != null) {
      this.mobileSoundButton.style.display = 'none';
    }
  }

  private bindPointerAudioUnlock(): void {
    if (this.pointerAudioBound) {
      return;
    }
    this.pointerAudioBound = true;
    window.addEventListener('pointerdown', this.onPointerDownForAudio, true);
    window.addEventListener('touchstart', this.onPointerDownForAudio, {
      capture: true,
      passive: true,
    });
  }

  private unbindPointerAudioUnlock(): void {
    if (!this.pointerAudioBound) {
      return;
    }
    this.pointerAudioBound = false;
    window.removeEventListener('pointerdown', this.onPointerDownForAudio, true);
    window.removeEventListener('touchstart', this.onPointerDownForAudio, true);
  }

  private layoutPanelForFlatPlay(): void {
    // Far enough right/clear of the left-shifted pad grid (confirmed via screenshot).
    this.applyPanelLayout(1.95, 1.48, -1.55, 0.26);
  }

  private layoutPanelForMrPlay(): void {
    // Beside the play space, still within easy controller / hand ray reach.
    this.applyPanelLayout(0.78, 1.32, -0.9, 0.28);
  }

  private applyPanelLayout(
    x: number,
    y: number,
    z: number,
    scaleValue: number,
  ): void {
    const entity = this.world.getSceneEntity('wall-tones-panel');
    if (entity == null) {
      return;
    }
    const position = entity.getVectorView(Transform, 'position');
    if (!this.panelPositionSaved) {
      this.savedPanelPosition.set(position);
      const scale = entity.getVectorView(Transform, 'scale');
      this.savedPanelScale.set(scale);
      this.panelPositionSaved = true;
    }
    position[0] = x;
    position[1] = y;
    position[2] = z;
    const scale = entity.getVectorView(Transform, 'scale');
    scale[0] = scaleValue;
    scale[1] = scaleValue;
    scale[2] = scaleValue;
    // Ensure the panel stays ray-targetable in MR and on desktop.
    this.restorePanelPointerCapture();
    if (!entity.hasComponent(RayInteractable)) {
      entity.addComponent(RayInteractable);
      this.panelRayRemoved = false;
    }
  }

  private restorePanelLayout(): void {
    if (!this.panelPositionSaved) {
      return;
    }
    const entity = this.world.getSceneEntity('wall-tones-panel');
    const position = entity?.getVectorView(Transform, 'position');
    if (entity == null || position == null) {
      return;
    }
    position[0] = this.savedPanelPosition[0]!;
    position[1] = this.savedPanelPosition[1]!;
    position[2] = this.savedPanelPosition[2]!;
    const scale = entity.getVectorView(Transform, 'scale');
    scale[0] = this.savedPanelScale[0]!;
    scale[1] = this.savedPanelScale[1]!;
    scale[2] = this.savedPanelScale[2]!;
  }

  private disablePanelPointerCapture(): void {
    const entity = this.world.getSceneEntity('wall-tones-panel');
    if (entity == null || this.panelRayRemoved) {
      return;
    }
    if (entity.hasComponent(RayInteractable)) {
      entity.removeComponent(RayInteractable);
      this.panelRayRemoved = true;
    }
  }

  private restorePanelPointerCapture(): void {
    const entity = this.world.getSceneEntity('wall-tones-panel');
    if (entity == null || !this.panelRayRemoved) {
      return;
    }
    entity.addComponent(RayInteractable);
    this.panelRayRemoved = false;
  }

  private formatSequenceLabel(): string {
    return this.game.sequence
      .map((padId) => WALL_TONE_PADS[padId]?.name ?? '?')
      .join(' → ');
  }

  private onVisibilityForFlatPlay(state: VisibilityState): void {
    const nonImmersive = state === VisibilityState.NonImmersive;
    if (
      this.experienceActive &&
      nonImmersive &&
      !this.wasNonImmersive &&
      getActiveWorldKind() === 'hub-vr' &&
      this.setupMode == null
    ) {
      this.beginFlatPlay();
    } else if (
      this.experienceActive &&
      !nonImmersive &&
      this.wasNonImmersive &&
      this.flowPhase === 'playing' &&
      this.setupMode == null
    ) {
      this.clearPads();
      this.showStudioBackdrop();
      this.setFlatHintVisible(false);
      this.flowPhase = 'choose-mode';
      this.statusText = 'Choose room scale or sitting.';
      this.setSetupUiVisible(true);
      this.speech.speak(WALL_TONES_SPEECH.chooseMode);
      this.renderPanel();
    }
    this.wasNonImmersive = nonImmersive;
  }

  private hideStudioBackdrop(): void {
    if (this.flatBackdropHidden) {
      return;
    }
    for (const nodeId of FLAT_BACKDROP_NODE_IDS) {
      const entity = this.world.getSceneEntity(nodeId);
      if (entity != null) {
        entity.setValue(Visibility, 'isVisible', false);
      }
    }
    this.flatBackdropHidden = true;
  }

  private showStudioBackdrop(): void {
    if (!this.flatBackdropHidden) {
      return;
    }
    for (const nodeId of FLAT_BACKDROP_NODE_IDS) {
      const entity = this.world.getSceneEntity(nodeId);
      if (entity != null) {
        entity.setValue(Visibility, 'isVisible', true);
      }
    }
    this.flatBackdropHidden = false;
  }

  private setFlatHintVisible(visible: boolean): void {
    this.world
      .getSceneObject<UIKitMLAsset>('wall-tones-panel')
      ?.getElementById('flat-play-hint')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private publishDebugBridge(): void {
    const system = this;
    window.__wallTonesDebug = {
      get phase() {
        return system.game.phase;
      },
      get flowPhase() {
        return system.flowPhase;
      },
      get sequence() {
        return [...system.game.sequence];
      },
      get inputStep() {
        return system.game.inputStep;
      },
      get streak() {
        return system.game.streak;
      },
      get bestStreak() {
        return system.game.bestStreak;
      },
      get flatAwaitingStart() {
        return system.flatAwaitingStart;
      },
      get slotCandidateCount() {
        return system.slotCandidates.length;
      },
      get selectedSlotCount() {
        return system.selectedSlotTransforms.length;
      },
      submitPad: (padIndex: number) => {
        system.handlePadInput(padIndex);
      },
      startFakeWallPick: () => {
        system.debugStartFakeWallPick();
      },
      selectSlot: (candidateIndex: number) => {
        const slot = system.slotCandidates.find(
          (entry) => entry.candidateIndex === candidateIndex,
        );
        if (slot != null) {
          system.selectWallSlot(slot);
        }
      },
    };
  }

  /** Emulator-only path: four 1x1m slots ahead of the headset for ray-pick tests. */
  private debugStartFakeWallPick(): void {
    if (!this.experienceActive) {
      this.experienceActive = true;
    }
    this.setupMode = 'room-scale';
    this.player.head.getWorldPosition(this.viewer);
    this.clearRoomSetupVisuals();
    this.clearPads();
    this.flowPhase = 'wall-picking';
    this.selectedSlotTransforms = [];
    this.slotSelectLatched = false;
    this.layoutPanelForMrPlay();
    this.setSetupUiVisible(false);
    this.setFlatHintVisible(false);
    this.setAirOrientUiVisible(false);
    this.setWallPickHintVisible(true);
    this.setRescanUiVisible(true);
    this.setRepeatUiVisible(false);
    // Place a 2x2 of slots in front of the headset along -Z (common XR forward).
    this.player.head.getWorldPosition(this.viewer);
    const forward = new Vector3(0, 0, -1);
    const right = new Vector3(1, 0, 0);
    const offsets = [
      [-1.1, 0.35],
      [1.1, 0.35],
      [-1.1, -0.95],
      [1.1, -0.95],
    ];
    const quat: [number, number, number, number] = [0, 0, 0, 1];
    offsets.forEach(([ox, oy], index) => {
      const pos = new Vector3(
        this.viewer.x + right.x * ox + forward.x * 1.6,
        this.viewer.y + oy,
        this.viewer.z + right.z * ox + forward.z * 1.6,
      );
      const slot = createSlotCandidateRuntime(
        this.world,
        {
          position: [pos.x, pos.y, pos.z],
          quaternion: quat,
          wallIndex: 0,
          candidateIndex: index,
        },
        HEADSET_PAD_SIZE_M,
      );
      this.slotCandidates.push(slot);
      this.slotArmed.set(index, true);
    });
    this.statusText = 'Debug wall pick: ray + select 4 green slots';
    this.renderPanel();
  }

  private async onBackToMenu(): Promise<void> {
    this.speech.speak(WALL_TONES_SPEECH.backToMenu);
    await this.leaveWallTonesMode();
    if (getActiveWorldKind() === 'walltones-ar') {
      await switchBackToHubMenu();
    } else {
      window.dispatchEvent(
        new CustomEvent('experience-mode-changed', {
          detail: { mode: 'menu' satisfies ExperienceMode },
        }),
      );
      sessionStorage.setItem('iwsdk-experience-mode', 'menu');
    }
  }

  private async onChooseSetup(mode: SetupMode): Promise<void> {
    if (!this.experienceActive || this.flowPhase !== 'choose-mode') {
      return;
    }
    this.setupMode = mode;
    sessionStorage.setItem('wall-tones-setup-mode', mode);
    // Mode choice now happens inside the AR world already — no XR tear-down here.
    if (getActiveWorldKind() === 'hub-vr') {
      this.statusText = 'Opening passthrough…';
      this.renderPanel();
      await switchToWallTonesArWorld();
      return;
    }
    this.setSetupUiVisible(false);
    if (mode === 'air') {
      this.startAirPlacement(WALL_TONES_SPEECH.chooseAirMenu);
      return;
    }
    this.setSpatialMeshesVisible(true);
    this.flowPhase = 'scanning';
    this.scanStartedAt = performance.now() / 1000;
    this.speech.speak(WALL_TONES_SPEECH.lookAround);
    this.statusText = 'Scanning the room…';
    this.renderPanel();
  }

  private tickScan(_delta: number): void {
    const elapsed = performance.now() / 1000 - this.scanStartedAt;
    if (elapsed < SCAN_WAIT_S) {
      const planeCount = this.queries.planes.entities.size;
      const meshCount = this.queries.meshes.entities.size;
      this.statusText = `Scanning… ${Math.ceil(SCAN_WAIT_S - elapsed)}s (${planeCount} planes, ${meshCount} meshes)`;
      this.renderPanel();
      return;
    }

    this.player.head.getWorldPosition(this.viewer);
    const planeEntities = [...this.queries.planes.entities];
    if (planeEntities.length === 0) {
      void this.offerRoomCaptureOrAir();
      return;
    }

    if (this.setupMode === 'sitting') {
      const floorY = this.viewer.y - 1.45;
      const tables = collectTablePlanes(planeEntities, floorY);
      if (tables.length === 0) {
        this.startAirPlacement(WALL_TONES_SPEECH.noTable);
        return;
      }
      this.startTablePicking(tables);
      return;
    }

    const walls = collectVerticalWalls(planeEntities, this.viewer);
    if (walls.length === 0) {
      void this.offerRoomCaptureOrAir();
      return;
    }
    // Interactive pick: show wall/mesh tints + candidate 1x1m slots.
    this.startWallPicking(walls);
  }

  private async offerRoomCaptureOrAir(): Promise<void> {
    const session = this.xrManager.getSession() as XRSession & {
      initiateRoomCapture?: () => Promise<undefined>;
    };
    if (typeof session?.initiateRoomCapture === 'function') {
      this.statusText = 'Opening room capture…';
      this.renderPanel();
      this.speech.speak(WALL_TONES_SPEECH.roomCapture);
      try {
        await session.initiateRoomCapture();
      } catch (error) {
        console.warn('[wall-tones] room capture failed', error);
      }
      this.scanStartedAt = performance.now() / 1000;
      return;
    }
    this.startAirPlacement(WALL_TONES_SPEECH.notEnoughWallSpace);
  }

  private startWallPicking(
    walls: ReturnType<typeof collectVerticalWalls>,
  ): void {
    this.beginSurfacePicking({
      surfaces: walls,
      padSizeM: HEADSET_PAD_SIZE_M,
      candidates: generateWallPadCandidates(
        walls,
        this.viewer.y,
        HEADSET_PAD_SIZE_M,
      ),
      speech: WALL_TONES_SPEECH.pickWallSlots,
      emptyFallback: () =>
        this.startAirPlacement(WALL_TONES_SPEECH.notEnoughWallSpace),
      statusLabel: 'wall slots',
    });
  }

  private startTablePicking(
    tables: ReturnType<typeof collectTablePlanes>,
  ): void {
    this.beginSurfacePicking({
      surfaces: tables,
      padSizeM: AIR_PLACE_SITTING_PAD_SIZE_M,
      candidates: generateTablePadCandidates(
        tables,
        AIR_PLACE_SITTING_PAD_SIZE_M,
      ),
      speech: WALL_TONES_SPEECH.pickTableSlots,
      emptyFallback: () => this.startAirPlacement(WALL_TONES_SPEECH.noTable),
      statusLabel: 'table slots',
    });
  }

  private beginSurfacePicking(options: {
    surfaces: ReturnType<typeof collectVerticalWalls>;
    padSizeM: number;
    candidates: ReturnType<typeof generateWallPadCandidates>;
    speech: string;
    emptyFallback: () => void;
    statusLabel: string;
  }): void {
    this.clearRoomSetupVisuals();
    this.clearPads();
    this.setSpatialMeshesVisible(true);
    this.flowPhase = 'wall-picking';
    this.lackingSpatialData = false;
    this.selectedSlotTransforms = [];
    this.slotSelectLatched = false;
    this.layoutPanelForMrPlay();
    this.setFlatHintVisible(false);
    this.setAirOrientUiVisible(false);
    this.setWallPickHintVisible(true);
    this.setRescanUiVisible(true);
    this.setRepeatUiVisible(false);

    applyRoomSetupTints(
      options.surfaces.map((surface) => surface.entity),
      this.queries.meshes.entities,
    );
    for (const surface of options.surfaces) {
      this.wallOverlayEntities.push(createWallOverlay(this.world, surface));
    }

    for (const candidate of options.candidates) {
      const slot = createSlotCandidateRuntime(
        this.world,
        candidate,
        options.padSizeM,
      );
      this.slotCandidates.push(slot);
      this.slotArmed.set(slot.candidateIndex, true);
    }

    if (this.slotCandidates.length === 0) {
      this.clearRoomSetupVisuals();
      options.emptyFallback();
      return;
    }

    this.speech.speak(options.speech);
    this.statusText = `Pick pad 1 of 4 — ${this.slotCandidates.length} ${options.statusLabel}`;
    this.renderPanel();
  }

  private tickWallPicking(): void {
    const rayHovered = this.findRayHoveredSlot();
    if (
      rayHovered != null &&
      !rayHovered.selected &&
      !this.statusText.startsWith(`Hover slot ${rayHovered.candidateIndex}`)
    ) {
      this.statusText = `Hover slot ${rayHovered.candidateIndex} — pinch to pick (${this.selectedSlotTransforms.length}/4)`;
      this.renderPanel();
    }
    for (const slot of this.slotCandidates) {
      if (slot.selected) {
        setCandidateVisualState(slot, 'selected');
        continue;
      }
      const ecsHovered = this.entityInQuery(
        slot.entity,
        this.queries.slotHovered.entities,
      );
      const hovered = ecsHovered || slot === rayHovered;
      const ecsPressed =
        ecsHovered &&
        this.entityInQuery(slot.entity, this.queries.slotPressed.entities);
      setCandidateVisualState(slot, hovered ? 'hovered' : 'idle');
      if (!ecsPressed) {
        this.slotArmed.set(slot.candidateIndex, true);
      }
      if (ecsPressed && this.slotArmed.get(slot.candidateIndex)) {
        this.slotArmed.set(slot.candidateIndex, false);
        this.selectWallSlot(slot);
      }
    }

    // Select via controller/hand trigger while the ray (or tip) is on a slot.
    let anySelectActive = false;
    for (const hand of ['right', 'left'] as const) {
      const select = this.input.xr.getSelectState(hand);
      if (!select.active && !select.start) {
        continue;
      }
      anySelectActive = true;
      if (this.slotSelectLatched && !select.start) {
        continue;
      }
      const aimed =
        this.findRayHoveredSlot(hand) ?? this.findTipHoveredSlot(hand);
      if (aimed != null && !aimed.selected) {
        this.slotSelectLatched = true;
        this.selectWallSlot(aimed);
        return;
      }
    }
    if (!anySelectActive) {
      this.slotSelectLatched = false;
    }
  }

  /** Closest slot under a controller/hand target ray within pad half-extent. */
  private findRayHoveredSlot(
    preferredHand?: 'left' | 'right',
  ): SlotCandidateRuntime | null {
    const hands =
      preferredHand != null
        ? [preferredHand]
        : (['right', 'left'] as const);
    let best: SlotCandidateRuntime | null = null;
    let bestAlong = Number.POSITIVE_INFINITY;
    const hitRadius = this.placementPadSizeM() * 0.55;
    for (const hand of hands) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter != null && !adapter.connected) {
        continue;
      }
      const raySpace = this.player.raySpaces[hand];
      raySpace.updateWorldMatrix(true, false);
      raySpace.getWorldPosition(this.rayOrigin);
      raySpace.getWorldQuaternion(this.gripQuat);
      // XR target rays point along local -Z.
      this.rayDir.set(0, 0, -1).applyQuaternion(this.gripQuat).normalize();
      for (const slot of this.slotCandidates) {
        if (slot.selected) {
          continue;
        }
        slot.root.getWorldPosition(this.padWorldPos);
        this.rayToSlot.copy(this.padWorldPos).sub(this.rayOrigin);
        const along = this.rayToSlot.dot(this.rayDir);
        if (along < 0.05 || along > 6) {
          continue;
        }
        this.rayClosest.copy(this.rayOrigin).addScaledVector(this.rayDir, along);
        const lateral = this.rayClosest.distanceTo(this.padWorldPos);
        if (lateral <= hitRadius && along < bestAlong) {
          bestAlong = along;
          best = slot;
        }
      }
    }
    return best;
  }

  private findTipHoveredSlot(
    hand: 'left' | 'right',
  ): SlotCandidateRuntime | null {
    this.player.indexTipSpaces[hand].getWorldPosition(this.tipScratch);
    let best: SlotCandidateRuntime | null = null;
    let bestDist = this.placementPadSizeM() * 0.55;
    for (const slot of this.slotCandidates) {
      if (slot.selected) {
        continue;
      }
      slot.root.getWorldPosition(this.padWorldPos);
      const dist = this.tipScratch.distanceTo(this.padWorldPos);
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    return best;
  }

  private selectWallSlot(slot: SlotCandidateRuntime): void {
    if (slot.selected || this.selectedSlotTransforms.length >= 4) {
      return;
    }
    // Keep picks spread out so pads do not stack.
    const minSpacing = this.placementPadSizeM() * 0.75;
    const tooClose = this.selectedSlotTransforms.some((prior) => {
      const dx = prior.position[0] - slot.transform.position[0];
      const dy = prior.position[1] - slot.transform.position[1];
      const dz = prior.position[2] - slot.transform.position[2];
      return Math.hypot(dx, dy, dz) < minSpacing;
    });
    if (tooClose) {
      this.statusText = 'Too close to another pick - choose a farther slot';
      this.renderPanel();
      return;
    }
    setCandidateVisualState(slot, 'selected');
    this.selectedSlotTransforms.push({
      position: slot.transform.position,
      quaternion: slot.transform.quaternion,
    });
    const count = this.selectedSlotTransforms.length;
    if (count >= 4) {
      const transforms = [...this.selectedSlotTransforms];
      const doneLine =
        this.setupMode === 'sitting'
          ? WALL_TONES_SPEECH.tableFound
          : WALL_TONES_SPEECH.padsOnWalls;
      this.clearRoomSetupVisuals();
      this.finishHeadsetPlacement(transforms, doneLine);
      return;
    }
    this.statusText = `Pick pad ${count + 1} of 4`;
    this.renderPanel();
  }

  private clearRoomSetupVisuals(): void {
    disposeSlotCandidates(this.slotCandidates);
    this.slotArmed.clear();
    this.selectedSlotTransforms = [];
    for (const entity of this.wallOverlayEntities) {
      entity.dispose({ disposeResources: true });
    }
    this.wallOverlayEntities = [];
    clearRoomSetupTints();
    this.setWallPickHintVisible(false);
  }

  /** Hide Quest plane/mesh proxies during play so only the pads remain visible. */
  private setSpatialMeshesVisible(visible: boolean): void {
    for (const entity of this.queries.planes.entities) {
      if (entity.object3D != null) {
        entity.object3D.visible = visible;
      }
    }
    for (const entity of this.queries.meshes.entities) {
      if (entity.object3D != null) {
        entity.object3D.visible = visible;
      }
    }
  }

  private placementPadSizeM(): number {
    return this.setupMode === 'sitting'
      ? AIR_PLACE_SITTING_PAD_SIZE_M
      : defaultHeadsetPadSize();
  }

  private startAirPlacement(line: string): void {
    this.clearRoomSetupVisuals();
    this.setSpatialMeshesVisible(false);
    this.flowPhase = 'air-placement';
    this.airPlaceStep = 0;
    this.lackingSpatialData = true;
    this.airOrientationLocked = null;
    // Keep dominantHand from the first panel select so ghost orientation
    // follows that placing hand; only clear it when leaving the experience.
    // Menu "Air place" covers both wall and table styles via hand tilt / locks.
    this.airOrientation =
      this.setupMode === 'sitting' ? 'horizontal' : 'vertical';
    this.syncAirPadSizeFromOrientation();
    this.clearPads();
    this.layoutPanelForMrPlay();
    this.setFlatHintVisible(false);
    this.setWallPickHintVisible(false);
    this.setAirOrientUiVisible(true);
    this.setRescanUiVisible(true);
    this.setRepeatUiVisible(false);
    this.speech.speak(line);
    this.speech.speak(WALL_TONES_SPEECH.chooseAirOrient);
    this.speech.speak(WALL_TONES_SPEECH.airPlace(1));
    this.statusText =
      this.setupMode === 'air'
        ? 'Air place: tilt for wall or table size, then pinch. Or Rescan room.'
        : 'Tilt placing hand to snap flat/upright, then pinch. Or Rescan room.';
    this.spawnGhostPad();
    this.renderPanel();
  }

  /** Room-scale air pads when upright; sitting-sized pads when flat. */
  private syncAirPadSizeFromOrientation(): void {
    if (this.setupMode === 'sitting') {
      this.airPadSizeM = AIR_PLACE_SITTING_PAD_SIZE_M;
      return;
    }
    if (this.setupMode === 'room-scale') {
      this.airPadSizeM = AIR_PLACE_ROOM_PAD_SIZE_M;
      return;
    }
    // Explicit Air place menu option: size follows orientation snap/lock.
    this.airPadSizeM =
      this.airOrientation === 'horizontal'
        ? AIR_PLACE_SITTING_PAD_SIZE_M
        : AIR_PLACE_ROOM_PAD_SIZE_M;
  }

  private setAirOrientation(orientation: AirOrientation): void {
    const sizeChanged =
      this.setupMode === 'air' && orientation !== this.airOrientation;
    this.airOrientation = orientation;
    this.airOrientationLocked = orientation;
    this.syncAirPadSizeFromOrientation();
    if (sizeChanged && this.flowPhase === 'air-placement' && this.ghostPad != null) {
      this.spawnGhostPad();
    }
    this.statusText =
      orientation === 'horizontal'
        ? 'Locked table / flat. Pinch to place.'
        : 'Locked wall / vertical. Pinch to place.';
    this.renderPanel();
  }

  private spawnGhostPad(): void {
    this.ghostPad?.entity.dispose({ disposeResources: true });
    this.ghostPad = createGhostPadRuntime(
      this.world,
      (this.airPlaceStep % 4) as WallTonePadId,
      this.airPadSizeM,
    );
  }

  private tickAirPlacement(delta: number): void {
    const hand = this.resolvePlacementHand();
    if (hand == null || this.ghostPad == null) {
      return;
    }
    this.updateGhostPadPose(hand, delta);

    const select = this.input.xr.getSelectState(hand);
    if (!select.start) {
      return;
    }
    if (this.dominantHand == null) {
      this.dominantHand = hand;
      sessionStorage.setItem('wall-tones-dominant-hand', hand);
    }
    const placed = this.ghostPad;
    solidifyGhostPad(placed, this.airPadSizeM);
    placed.entity.addComponent(XRAnchor);
    this.pads.push(placed);
    this.ghostPad = null;
    this.airPlaceStep += 1;
    if (this.airPlaceStep >= 4) {
      this.flowPhase = 'playing';
      this.setAirOrientUiVisible(false);
      this.setRescanUiVisible(this.lackingSpatialData);
      this.setRepeatUiVisible(true);
      this.setSpatialMeshesVisible(false);
      this.statusText = 'Get ready…';
      this.beginRoundWithIntro();
      this.renderPanel();
      return;
    }
    this.speech.speak(WALL_TONES_SPEECH.airPlace(this.airPlaceStep + 1));
    this.statusText = `Pinch to place outline ${this.airPlaceStep + 1} of 4.`;
    this.spawnGhostPad();
    this.renderPanel();
  }

  private updateGhostPadPose(hand: 'left' | 'right', delta: number): void {
    if (this.ghostPad == null) {
      return;
    }
    this.player.head.getWorldPosition(this.viewer);
    this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);
    this.readGripWorldQuaternion(hand, this.gripQuat);

    this.ghostForward.set(
      this.gripWorld.x - this.viewer.x,
      0,
      this.gripWorld.z - this.viewer.z,
    );
    if (this.ghostForward.lengthSq() < 1e-6) {
      this.player.head.getWorldDirection(this.ghostForward);
      this.ghostForward.y = 0;
    }
    this.ghostForward.normalize();

    this.ghostTarget
      .copy(this.gripWorld)
      .addScaledVector(this.ghostForward, AIR_GHOST_HAND_OFFSET_M);
    const preferredY =
      this.setupMode === 'sitting'
        ? this.viewer.y - 0.55
        : this.viewer.y - 0.35;
    this.ghostTarget.y = preferredY * 0.35 + this.gripWorld.y * 0.65;

    this.awayFromHead.copy(this.ghostTarget).sub(this.viewer);
    const minDist = Math.max(
      AIR_GHOST_MIN_HEAD_DISTANCE_M,
      this.airPadSizeM * 0.5 + 0.45,
    );
    if (this.awayFromHead.length() < minDist) {
      if (this.awayFromHead.lengthSq() < 1e-6) {
        this.awayFromHead.copy(this.ghostForward);
      }
      this.awayFromHead.setLength(minDist);
      this.ghostTarget.copy(this.viewer).add(this.awayFromHead);
      this.ghostTarget.y = preferredY * 0.35 + this.gripWorld.y * 0.65;
      this.awayFromHead.copy(this.ghostTarget).sub(this.viewer);
      if (this.awayFromHead.length() < minDist) {
        this.awayFromHead.setLength(minDist);
        this.ghostTarget.copy(this.viewer).add(this.awayFromHead);
      }
    }

    this.ghostPad.root.position.copy(this.ghostTarget);
    this.updateAirOrientationFromHand();
    this.buildTargetGhostQuaternion(this.targetGhostQuat);
    // Slerp in local space toward the snapped target (frame-rate independent).
    const alpha = 1 - Math.pow(1 - AIR_ORIENT_SLERP, Math.max(delta, 1 / 120) * 72);
    this.ghostQuat.copy(this.ghostPad.root.quaternion);
    this.ghostQuat.slerp(this.targetGhostQuat, alpha);
    this.ghostPad.root.quaternion.copy(this.ghostQuat);
  }

  private updateAirOrientationFromHand(): void {
    if (this.airOrientationLocked != null) {
      this.airOrientation = this.airOrientationLocked;
      return;
    }
    // Grip local +Y follows the hand long axis: high |world Y| ⇒ upright hand ⇒ wall.
    this.handUp.set(0, 1, 0).applyQuaternion(this.gripQuat).normalize();
    const uprightness = Math.abs(this.handUp.y);
    let next = this.airOrientation;
    if (uprightness >= AIR_ORIENT_SNAP_UPRIGHT) {
      next = 'vertical';
    } else if (uprightness <= AIR_ORIENT_SNAP_FLAT) {
      next = 'horizontal';
    }
    if (next !== this.airOrientation) {
      this.airOrientation = next;
      const prevSize = this.airPadSizeM;
      this.syncAirPadSizeFromOrientation();
      if (
        this.setupMode === 'air' &&
        this.airPadSizeM !== prevSize &&
        this.ghostPad != null
      ) {
        this.spawnGhostPad();
      }
      this.statusText =
        next === 'horizontal'
          ? 'Snapped flat - pinch to place'
          : 'Snapped upright - pinch to place';
      this.renderPanel();
    }
  }

  private buildTargetGhostQuaternion(out: Quaternion): void {
    const yaw = Math.atan2(
      this.viewer.x - this.ghostTarget.x,
      this.viewer.z - this.ghostTarget.z,
    );
    const halfYaw = yaw * 0.5;
    out.set(0, Math.sin(halfYaw), 0, Math.cos(halfYaw));
    if (this.airOrientation === 'horizontal') {
      this.scratchQuat.setFromAxisAngle(this.axisX, -Math.PI / 2);
      out.multiply(this.scratchQuat);
    }
  }

  private readGripWorldQuaternion(
    hand: 'left' | 'right',
    out: Quaternion,
  ): void {
    const grip = this.player.gripSpaces[hand];
    grip.updateWorldMatrix(true, false);
    grip.getWorldQuaternion(out);
  }

  private resolvePlacementHand(): 'left' | 'right' | null {
    if (this.dominantHand != null) {
      return this.dominantHand;
    }
    // Prefer a connected hand (right first) until the first UI/pinch sets dominant.
    for (const hand of ['right', 'left'] as const) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter?.connected) {
        return hand;
      }
    }
    for (const hand of ['right', 'left'] as const) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter instanceof XRHandVisualAdapter) {
        return hand;
      }
    }
    return 'right';
  }

  private finishHeadsetPlacement(
    transforms: PlacedPadTransform[],
    line: string,
  ): void {
    this.clearRoomSetupVisuals();
    this.clearPads();
    this.lackingSpatialData = false;
    this.setWallPickHintVisible(false);
    this.setRescanUiVisible(false);
    this.setAirOrientUiVisible(false);
    // Play mode: only the four pads — hide plane/mesh proxies.
    this.setSpatialMeshesVisible(false);
    const size = this.placementPadSizeM();
    transforms.forEach((transform, index) => {
      const pad = createPadRuntime(this.world, index as WallTonePadId, size, {
        rayInteractable: false,
        anchor: true,
      });
      pad.root.position.set(...transform.position);
      pad.root.quaternion.set(...transform.quaternion);
      this.pads.push(pad);
    });
    this.flowPhase = 'playing';
    this.layoutPanelForMrPlay();
    this.setRepeatUiVisible(true);
    this.statusText = 'Get ready…';
    this.beginRoundWithIntro(line);
    this.renderPanel();
  }

  private spawnDesktopPads(): void {
    this.clearPads();
    this.world.camera.getWorldPosition(this.cameraPosition);
    this.world.camera.getWorldDirection(this.cameraForward);
    const size = defaultDesktopPadSize();
    const transforms = planDesktopGridFromCamera(
      this.cameraPosition,
      this.cameraForward,
      size,
    );
    transforms.forEach((transform, index) => {
      const pad = createPadRuntime(this.world, index as WallTonePadId, size, {
        rayInteractable: true,
        anchor: false,
      });
      pad.root.position.set(...transform.position);
      pad.root.quaternion.set(...transform.quaternion);
      pad.touchVolume.scale.set(1.15, 1.15, 1.25);
      this.pads.push(pad);
    });
    if (!this.flatAwaitingStart) {
      this.statusText = 'Watch the sequence';
    }
    this.renderPanel();
  }

  private clearPads(): void {
    disposePadRuntimes(this.pads);
    this.ghostPad?.entity.dispose({ disposeResources: true });
    this.ghostPad = null;
  }

  /** Intro voice, then a beat of silence, then the first pad blinks with its tone. */
  private beginRoundWithIntro(leadInLine?: string): void {
    this.playbackQueue = this.playbackQueue.then(async () => {
      if (!this.experienceActive || this.flowPhase !== 'playing') {
        return;
      }
      this.statusText = 'Listen to the intro…';
      this.renderPanel();
      if (leadInLine != null && leadInLine.length > 0) {
        await this.speech.speakAsync(leadInLine);
        await this.wait(0.35);
      }
      if (!this.experienceActive || this.flowPhase !== 'playing') {
        return;
      }
      await this.speech.speakAsync(WALL_TONES_SPEECH.gameStart);
      await this.wait(POST_INTRO_DELAY_S);
      if (!this.experienceActive || this.flowPhase !== 'playing') {
        return;
      }
      this.game.startNewRun();
      this.renderPanel();
      await this.playSequence();
    });
  }

  private async playSequence(): Promise<void> {
    if (!this.experienceActive) {
      return;
    }
    this.game.phase = 'playback';
    this.inputNeedsClear = true;
    this.armAllPads();
    this.statusText = `Listen: ${this.formatSequenceLabel()}`;
    this.renderPanel();
    for (let index = 0; index < this.game.sequence.length; index += 1) {
      const padId = this.game.sequence[index]!;
      const pad = this.pads[padId];
      if (pad != null) {
        flashPad(pad, true);
        await playPadTone(padId);
        await this.wait(NOTE_GAP_S + 0.45);
        flashPad(pad, false);
      }
      await this.wait(NOTE_GAP_S);
    }
    this.game.phase = 'input';
    this.game.inputStep = 0;
    this.inputNeedsClear = true;
    this.lastInputAt = performance.now() / 1000;
    this.idleReplayQueued = false;
    this.setRepeatUiVisible(true);
    this.statusText = `Your turn: ${this.formatSequenceLabel()}`;
    this.renderPanel();
  }

  private armAllPads(): void {
    for (const pad of this.pads) {
      pad.pointerArmed = true;
      pad.fingerInside = false;
    }
  }

  private entityInQuery(entity: import('@iwsdk/core').Entity, set: Set<import('@iwsdk/core').Entity>): boolean {
    for (const candidate of set) {
      if (candidate === entity) {
        return true;
      }
    }
    return false;
  }

  private readDesktopTouches(): void {
    if (this.inputNeedsClear) {
      let anyPressed = false;
      for (const pad of this.pads) {
        const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
        const pressed =
          hovered &&
          this.entityInQuery(pad.entity, this.queries.padPressed.entities);
        if (pressed) {
          anyPressed = true;
        }
        // Re-arm on release even while still hovered (same-pad twice in a row).
        if (!pressed) {
          pad.pointerArmed = true;
        }
      }
      if (!anyPressed) {
        this.inputNeedsClear = false;
        this.armAllPads();
      }
      return;
    }
    for (const pad of this.pads) {
      const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
      const pressed =
        hovered &&
        this.entityInQuery(pad.entity, this.queries.padPressed.entities);
      // Edge-trigger on press; re-arm when the button is released while hovered
      // so sequences like green→green register the second press.
      if (!pressed) {
        pad.pointerArmed = true;
        continue;
      }
      if (pad.pointerArmed) {
        pad.pointerArmed = false;
        this.handlePadInput(pad.padIndex);
      }
    }
  }

  private readFingertipTouches(): void {
    if (this.inputNeedsClear) {
      let anyInside = false;
      for (const pad of this.pads) {
        const inside = this.sampleTipInsidePad(pad) != null;
        pad.fingerInside = inside;
        if (inside) {
          anyInside = true;
        }
      }
      if (!anyInside) {
        this.inputNeedsClear = false;
        this.armAllPads();
        this.touchEnterFrames.clear();
        this.touchExitFrames.clear();
      }
      return;
    }

    // Only the closest pad under either tip may fire — avoids multi-pad ghosts.
    let bestPad: PadRuntime | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const pad of this.pads) {
      const dist = this.sampleTipInsidePad(pad);
      if (dist == null) {
        const exit = (this.touchExitFrames.get(pad.padIndex) ?? 0) + 1;
        this.touchExitFrames.set(pad.padIndex, exit);
        if (exit >= TOUCH_EXIT_FRAMES) {
          pad.fingerInside = false;
          this.touchEnterFrames.set(pad.padIndex, 0);
        }
        continue;
      }
      this.touchExitFrames.set(pad.padIndex, 0);
      if (dist < bestDist) {
        bestDist = dist;
        bestPad = pad;
      }
    }

    for (const pad of this.pads) {
      if (pad === bestPad) {
        const enter = (this.touchEnterFrames.get(pad.padIndex) ?? 0) + 1;
        this.touchEnterFrames.set(pad.padIndex, enter);
        if (!pad.fingerInside && enter >= TOUCH_ENTER_FRAMES) {
          pad.fingerInside = true;
          this.handlePadInput(pad.padIndex);
        }
      } else if (bestPad != null) {
        this.touchEnterFrames.set(pad.padIndex, 0);
      }
    }
  }

  /**
   * Returns distance from tip to pad center when the index tip is inside the
   * touch volume; otherwise null. Requires a connected hand and tip near that
   * hand's grip so untracked ghost tips cannot false-press.
   */
  private sampleTipInsidePad(pad: PadRuntime): number | null {
    pad.root.updateWorldMatrix(true, false);
    pad.touchVolume.updateWorldMatrix(true, false);
    pad.root.getWorldPosition(this.padWorldPos);
    const maxCenter =
      pad.sizeM * 0.5 * Math.SQRT2 + TOUCH_CENTER_PAD_MARGIN_M;

    for (const hand of ['left', 'right'] as const) {
      const adapter = this.input.xr.visualAdapters[hand].peek();
      if (adapter == null || !adapter.connected) {
        continue;
      }
      this.player.indexTipSpaces[hand].getWorldPosition(this.tipScratch);
      this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);
      if (this.tipScratch.distanceTo(this.gripWorld) > TOUCH_TIP_GRIP_MAX_M) {
        continue;
      }
      const centerDist = this.tipScratch.distanceTo(this.padWorldPos);
      if (centerDist > maxCenter) {
        continue;
      }
      this.tipLocal.copy(this.tipScratch);
      pad.touchVolume.worldToLocal(this.tipLocal);
      const touchMesh = pad.touchVolume as import('@iwsdk/core').Mesh;
      const geom = touchMesh.geometry as {
        parameters?: { width?: number; height?: number; depth?: number };
      };
      const hx = (geom.parameters?.width ?? pad.sizeM) * 0.5;
      const hy = (geom.parameters?.height ?? pad.sizeM) * 0.5;
      const hz = (geom.parameters?.depth ?? TOUCH_BOX_DEPTH_M) * 0.5;
      // Front-biased slab: allow a little behind the face, reject deep punch-through.
      if (
        Math.abs(this.tipLocal.x) <= hx &&
        Math.abs(this.tipLocal.y) <= hy &&
        this.tipLocal.z >= -hz * 0.35 &&
        this.tipLocal.z <= hz
      ) {
        return centerDist;
      }
    }
    return null;
  }

  private handlePadInput(padIndex: number): void {
    if (this.flatAwaitingStart && this.useDesktopPath()) {
      void this.startFlatPlayFromPad(padIndex);
      return;
    }
    if (this.game.phase !== 'input') {
      return;
    }
    this.lastInputAt = performance.now() / 1000;
    this.idleReplayQueued = false;
    const expected = this.game.sequence[this.game.inputStep];
    if (expected == null) {
      return;
    }
    const pad = this.pads[padIndex];
    if (pad != null) {
      flashPad(pad, true);
      if (this.useDesktopInput()) {
        playPadToneFromUserAction(padIndex);
      } else {
        void playPadTone(padIndex);
      }
      window.setTimeout(() => flashPad(pad, false), 350);
    }
    if (padIndex !== expected) {
      void this.onWrongInput();
      return;
    }
    const completed = this.game.onCorrectInput();
    this.renderPanel();
    if (completed) {
      // Lock input immediately so a held finger/click cannot eat the next round.
      this.game.phase = 'playback';
      this.inputNeedsClear = true;
      this.statusText = `Nice - streak ${this.game.streak}. Next pattern…`;
      this.renderPanel();
      const streak = this.game.streak;
      this.playbackQueue = this.playbackQueue.then(async () => {
        if (streak > 0 && streak % 5 === 0) {
          await this.speech.speakAsync(WALL_TONES_SPEECH.streakMilestone(streak));
          await this.wait(0.35);
        } else {
          await this.wait(BETWEEN_ROUNDS_DELAY_S);
        }
        if (!this.experienceActive || this.flowPhase !== 'playing') {
          return;
        }
        await this.playSequence();
      });
    }
  }

  private async startFlatPlayFromPad(padIndex: number): Promise<void> {
    if (!this.flatAwaitingStart || !this.experienceActive) {
      return;
    }
    this.flatAwaitingStart = false;
    primeWallTonesAudioFromGesture();
    // Confirm the tap briefly, then run the spoken intro before the first sequence tone.
    const pad = this.pads[padIndex];
    if (pad != null) {
      flashPad(pad, true);
      playPadToneFromUserAction(padIndex);
      window.setTimeout(() => flashPad(pad, false), 280);
    }
    this.statusText = 'Get ready…';
    this.renderPanel();
    this.beginRoundWithIntro();
  }

  private async onWrongInput(): Promise<void> {
    this.game.phase = 'resetting';
    this.inputNeedsClear = true;
    await playErrorTone();
    this.statusText = 'Try again';
    this.renderPanel();
    this.playbackQueue = this.playbackQueue.then(async () => {
      await this.speech.speakAsync(WALL_TONES_SPEECH.wrongTouch);
      await this.wait(WRONG_RESET_DELAY_S);
      if (!this.experienceActive) {
        return;
      }
      this.game.onWrongInput();
      this.renderPanel();
      await this.playSequence();
    });
  }

  private useDesktopPath(): boolean {
    return this.world.visibilityState.peek() === VisibilityState.NonImmersive;
  }

  private useDesktopInput(): boolean {
    return this.useDesktopPath();
  }

  private setSetupUiVisible(visible: boolean): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
    panel
      ?.getElementById('setup-mode-row')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private setAirOrientUiVisible(visible: boolean): void {
    this.world
      .getSceneObject<UIKitMLAsset>('wall-tones-panel')
      ?.getElementById('air-orient-row')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private setRepeatUiVisible(visible: boolean): void {
    this.world
      .getSceneObject<UIKitMLAsset>('wall-tones-panel')
      ?.getElementById('repeat-pattern-button')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private setRescanUiVisible(visible: boolean): void {
    this.world
      .getSceneObject<UIKitMLAsset>('wall-tones-panel')
      ?.getElementById('rescan-room-button')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private setWallPickHintVisible(visible: boolean): void {
    this.world
      .getSceneObject<UIKitMLAsset>('wall-tones-panel')
      ?.getElementById('wall-pick-hint')
      ?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  private async onRescanRoom(): Promise<void> {
    if (!this.experienceActive) {
      return;
    }
    if (
      this.flowPhase !== 'air-placement' &&
      this.flowPhase !== 'playing' &&
      this.flowPhase !== 'wall-picking'
    ) {
      return;
    }
    this.speech.speak(WALL_TONES_SPEECH.rescanRoom);
    this.statusText = 'Rescanning room…';
    this.renderPanel();
    this.clearRoomSetupVisuals();
    this.clearPads();
    this.ghostPad = null;
    this.airPlaceStep = 0;
    this.game.phase = 'idle';
    this.playbackQueue = Promise.resolve();
    this.setAirOrientUiVisible(false);
    this.setRepeatUiVisible(false);

    const session = this.xrManager.getSession() as XRSession & {
      initiateRoomCapture?: () => Promise<undefined>;
    };
    if (typeof session?.initiateRoomCapture === 'function') {
      try {
        await session.initiateRoomCapture();
      } catch (error) {
        console.warn('[wall-tones] rescan room capture failed', error);
      }
    }
    this.setSpatialMeshesVisible(true);
    this.flowPhase = 'scanning';
    this.scanStartedAt = performance.now() / 1000;
    this.lackingSpatialData = false;
    this.setRescanUiVisible(false);
    this.speech.speak(WALL_TONES_SPEECH.lookAround);
    this.renderPanel();
  }

  private async onRepeatPattern(): Promise<void> {
    if (!this.experienceActive || this.flowPhase !== 'playing') {
      return;
    }
    if (this.game.sequence.length === 0) {
      return;
    }
    if (this.game.phase === 'playback' || this.game.phase === 'resetting') {
      return;
    }
    this.lastInputAt = performance.now() / 1000;
    this.idleReplayQueued = false;
    this.speech.speak(WALL_TONES_SPEECH.repeatPattern);
    this.game.inputStep = 0;
    this.game.phase = 'playback';
    this.inputNeedsClear = true;
    this.statusText = 'Repeating pattern…';
    this.renderPanel();
    this.playbackQueue = this.playbackQueue.then(async () => {
      if (!this.experienceActive || this.flowPhase !== 'playing') {
        return;
      }
      await this.playSequence();
    });
  }

  private tickIdleReplay(): void {
    if (
      !this.experienceActive ||
      this.flowPhase !== 'playing' ||
      this.game.phase !== 'input' ||
      this.game.sequence.length === 0 ||
      this.idleReplayQueued
    ) {
      return;
    }
    const now = performance.now() / 1000;
    if (this.lastInputAt <= 0) {
      this.lastInputAt = now;
      return;
    }
    if (now - this.lastInputAt < IDLE_REPLAY_S) {
      return;
    }
    this.idleReplayQueued = true;
    this.lastInputAt = now;
    this.game.inputStep = 0;
    this.game.phase = 'playback';
    this.inputNeedsClear = true;
    this.statusText = 'Still there? Replaying…';
    this.renderPanel();
    this.playbackQueue = this.playbackQueue.then(async () => {
      await this.speech.speakAsync(WALL_TONES_SPEECH.idleReplay);
      await this.wait(0.4);
      if (!this.experienceActive || this.flowPhase !== 'playing') {
        return;
      }
      await this.playSequence();
    });
  }

  private renderPanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
    if (panel == null) {
      return;
    }
    panel
      .getElementById<UIKit.Text>('wall-tones-best-streak')
      ?.setProperties({ text: String(this.game.bestStreak) });
    panel
      .getElementById<UIKit.Text>('wall-tones-status')
      ?.setProperties({
        text: this.statusText || 'Ready',
      });
    panel
      .getElementById<UIKit.Text>('wall-tones-current-streak')
      ?.setProperties({ text: String(this.game.streak) });
  }

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, seconds * 1000);
    });
  }
}
