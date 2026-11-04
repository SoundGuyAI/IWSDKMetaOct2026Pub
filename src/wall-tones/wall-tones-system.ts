import {
  Hovered,
  Pressed,
  RayInteractable,
  Transform,
  UIKit,
  Visibility,
  UIKitMLAsset,
  VisibilityState,
  Vector3,
  XRAnchor,
  XRPlane,
  createSystem,
} from '@iwsdk/core';
import { XRHandVisualAdapter } from '@iwsdk/xr-input';
import type { ExperienceMode } from '../app-mode.js';
import { playErrorTone, playPadTone, playPadToneFromUserAction, primeWallTonesAudioFromGesture, suspendAudioContext, needsExplicitMobileSoundUnlock, isHtmlAudioPoolUnlocked } from './audio.js';
import {
  AIR_GHOST_HAND_OFFSET_M,
  AIR_GHOST_MIN_HEAD_DISTANCE_M,
  AIR_PLACE_ROOM_PAD_SIZE_M,
  AIR_PLACE_SITTING_PAD_SIZE_M,
  NOTE_GAP_S,
  BETWEEN_ROUNDS_DELAY_S,
  IDLE_REPLAY_S,
  POST_INTRO_DELAY_S,
  SCAN_WAIT_S,
  TOUCH_SLOP_SCALE,
  WALL_TONE_PADS,
  WRONG_RESET_DELAY_S,
  type WallTonePadId,
} from './constants.js';
import {
  collectTablePlanes,
  collectVerticalWalls,
  planDesktopGridFromCamera,
  planRoomScalePads,
  planTablePads,
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
import { WallTonesSequence } from './sequence.js';
import { WALL_TONES_SPEECH, WallTonesSpeech, unlockSpeechFromGesture, resetSpeechUnlock } from './speech.js';
import {
  getActiveWorldKind,
  switchBackToHubMenu,
  switchToWallTonesArWorld,
} from './world-host.js';
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
  sequence: readonly number[];
  inputStep: number;
  streak: number;
  bestStreak: number;
  flatAwaitingStart: boolean;
  submitPad: (padIndex: number) => void;
};

declare global {
  interface Window {
    __wallTonesDebug?: WallTonesDebugBridge;
  }
}

type SetupMode = 'room-scale' | 'sitting';
type AirOrientation = 'vertical' | 'horizontal';

type FlowPhase =
  | 'inactive'
  | 'choose-mode'
  | 'scanning'
  | 'air-placement'
  | 'playing';

export class WallTonesSystem extends createSystem({
  pads: { required: [WallTonePad] },
  planes: { required: [XRPlane] },
  padHovered: { required: [WallTonePad, Hovered] },
  padPressed: { required: [WallTonePad, Pressed] },
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
  private lastInputAt = 0;
  private idleReplayQueued = false;
  private panelRayRemoved = false;
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
    const pendingSetup = sessionStorage.getItem('wall-tones-setup-mode');
    if (pendingSetup === 'room-scale' || pendingSetup === 'sitting') {
      sessionStorage.removeItem('wall-tones-setup-mode');
      this.setupMode = pendingSetup;
      this.experienceActive = true;
      this.flowPhase = 'scanning';
      this.scanStartedAt = performance.now() / 1000;
      this.bindPanelIfNeeded();
      this.speech.speak(WALL_TONES_SPEECH.lookAround);
    }
  }

  update(delta: number): void {
    if (!this.experienceActive) {
      return;
    }
    this.bindPanelIfNeeded();
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
    if (this.flowPhase === 'air-placement') {
      this.tickAirPlacement();
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
      .getElementById('orient-vertical-button')
      ?.addEventListener('click', () => this.setAirOrientation('vertical'));
    panel
      .getElementById('orient-horizontal-button')
      ?.addEventListener('click', () => this.setAirOrientation('horizontal'));
    panel
      .getElementById('repeat-pattern-button')
      ?.addEventListener('click', () => void this.onRepeatPattern());
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

    this.flowPhase = 'choose-mode';
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
    this.playbackQueue = Promise.resolve();
    this.game.phase = 'idle';
    this.game.resetAllScores();
    this.speech.cancel();
    suspendAudioContext();
    resetSpeechUnlock();
    this.unbindPointerAudioUnlock();
    this.hideMobileSoundOverlay();
    this.clearPads();
    this.ghostPad = null;
    this.setupMode = null;
    this.setFlatHintVisible(false);
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
      submitPad: (padIndex: number) => {
        system.handlePadInput(padIndex);
      },
    };
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
    this.statusText = 'Starting passthrough setup…';
    this.renderPanel();
    if (getActiveWorldKind() === 'hub-vr') {
      await switchToWallTonesArWorld();
      return;
    }
    this.flowPhase = 'scanning';
    this.scanStartedAt = performance.now() / 1000;
    this.speech.speak(WALL_TONES_SPEECH.lookAround);
    this.renderPanel();
  }

  private tickScan(_delta: number): void {
    const elapsed = performance.now() / 1000 - this.scanStartedAt;
    if (elapsed < SCAN_WAIT_S) {
      this.statusText = `Scanning the room… ${Math.ceil(SCAN_WAIT_S - elapsed)}s`;
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
      const transforms = planTablePads(tables[0]!);
      this.finishHeadsetPlacement(transforms, WALL_TONES_SPEECH.tableFound);
      return;
    }

    const walls = collectVerticalWalls(planeEntities, this.viewer);
    const transforms = planRoomScalePads(walls, this.viewer.y);
    if (transforms == null) {
      this.startAirPlacement(WALL_TONES_SPEECH.notEnoughWallSpace);
      return;
    }
    this.finishHeadsetPlacement(transforms, WALL_TONES_SPEECH.padsOnWalls);
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

  private startAirPlacement(line: string): void {
    this.flowPhase = 'air-placement';
    this.airPlaceStep = 0;
    this.airOrientation =
      this.setupMode === 'sitting' ? 'horizontal' : 'vertical';
    this.airPadSizeM =
      this.setupMode === 'sitting'
        ? AIR_PLACE_SITTING_PAD_SIZE_M
        : AIR_PLACE_ROOM_PAD_SIZE_M;
    this.clearPads();
    this.layoutPanelForMrPlay();
    this.setAirOrientUiVisible(true);
    this.setRepeatUiVisible(false);
    this.speech.speak(line);
    this.speech.speak(WALL_TONES_SPEECH.chooseAirOrient);
    this.speech.speak(WALL_TONES_SPEECH.airPlace(1));
    this.statusText =
      this.airOrientation === 'horizontal'
        ? 'Flat pads — pinch to place. Switch to Wall if you want vertical.'
        : 'Vertical pads — pinch to place. Switch to Table if you want flat.';
    this.spawnGhostPad();
    this.renderPanel();
  }

  private setAirOrientation(orientation: AirOrientation): void {
    this.airOrientation = orientation;
    this.statusText =
      orientation === 'horizontal'
        ? 'Table / flat outlines. Pinch to place.'
        : 'Wall / vertical outlines. Pinch to place.';
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

  private tickAirPlacement(): void {
    const hand = this.preferredPlacementHand();
    if (hand == null || this.ghostPad == null) {
      return;
    }
    this.updateGhostPadPose(hand);

    const select = this.input.xr.getSelectState(hand);
    if (!select.start) {
      return;
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
      this.setRepeatUiVisible(true);
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

  private updateGhostPadPose(hand: 'left' | 'right'): void {
    if (this.ghostPad == null) {
      return;
    }
    this.player.head.getWorldPosition(this.viewer);
    this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);

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
    // Prefer table/lap height for sitting, mid-torso for room-scale air place.
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
    const yaw = Math.atan2(
      this.viewer.x - this.ghostTarget.x,
      this.viewer.z - this.ghostTarget.z,
    );
    if (this.airOrientation === 'horizontal') {
      // Face up like a table pad; yaw still aims the square toward the player.
      this.ghostPad.root.rotation.set(-Math.PI / 2, yaw, 0);
    } else {
      this.ghostPad.root.rotation.set(0, yaw, 0);
    }
  }

  private preferredPlacementHand(): 'left' | 'right' | null {
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
    this.clearPads();
    const size = defaultHeadsetPadSize();
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
    this.setAirOrientUiVisible(false);
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
        const inside = this.isHandTouchingPad(pad);
        pad.fingerInside = inside;
        if (inside) {
          anyInside = true;
        }
      }
      if (!anyInside) {
        this.inputNeedsClear = false;
        this.armAllPads();
      }
      return;
    }
    for (const pad of this.pads) {
      const inside = this.isHandTouchingPad(pad);
      if (!inside) {
        pad.fingerInside = false;
        continue;
      }
      if (!pad.fingerInside) {
        pad.fingerInside = true;
        this.handlePadInput(pad.padIndex);
      }
    }
  }

  private isHandTouchingPad(pad: PadRuntime): boolean {
    return (
      this.isFingerInsidePad(pad, 'left') ||
      this.isFingerInsidePad(pad, 'right') ||
      this.isGripNearPad(pad, 'left') ||
      this.isGripNearPad(pad, 'right')
    );
  }

  private isFingerInsidePad(pad: PadRuntime, hand: 'left' | 'right'): boolean {
    // Sample tip spaces even when the visual is a controller — Quest still
    // updates index tips, and requiring XRHandVisualAdapter blocked many hits.
    this.player.indexTipSpaces[hand].getWorldPosition(
      hand === 'left' ? this.tipLeft : this.tipRight,
    );
    const tip = hand === 'left' ? this.tipLeft : this.tipRight;
    pad.root.updateWorldMatrix(true, false);
    pad.touchVolume.updateWorldMatrix(true, false);
    this.tipLocal.copy(tip);
    pad.touchVolume.worldToLocal(this.tipLocal);
    const touchMesh = pad.touchVolume as import('@iwsdk/core').Mesh;
    const geom = touchMesh.geometry as {
      parameters?: { width?: number; height?: number; depth?: number };
    };
    const width = geom.parameters?.width ?? 0.5;
    const height = geom.parameters?.height ?? 0.5;
    const depth = geom.parameters?.depth ?? 0.35;
    const hx = width * 0.5 * TOUCH_SLOP_SCALE;
    const hy = height * 0.5 * TOUCH_SLOP_SCALE;
    const hz = depth * 0.5 * TOUCH_SLOP_SCALE;
    return (
      Math.abs(this.tipLocal.x) <= hx &&
      Math.abs(this.tipLocal.y) <= hy &&
      Math.abs(this.tipLocal.z) <= hz
    );
  }

  private isGripNearPad(pad: PadRuntime, hand: 'left' | 'right'): boolean {
    this.player.gripSpaces[hand].getWorldPosition(this.gripWorld);
    pad.root.updateWorldMatrix(true, false);
    pad.root.getWorldPosition(this.ghostTarget);
    const touchMesh = pad.touchVolume as import('@iwsdk/core').Mesh;
    const geom = touchMesh.geometry as {
      parameters?: { width?: number };
    };
    const width = geom.parameters?.width ?? this.airPadSizeM;
    const reach = Math.max(0.28, width * 0.65);
    return this.gripWorld.distanceTo(this.ghostTarget) <= reach;
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
      this.statusText = `Nice — streak ${this.game.streak}. Next pattern…`;
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
