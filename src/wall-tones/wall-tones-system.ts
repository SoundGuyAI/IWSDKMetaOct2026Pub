import {
  Hovered,
  Pressed,
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
import { playErrorTone, playPadTone, suspendAudioContext } from './audio.js';
import {
  AIR_GHOST_DISTANCE_M,
  NOTE_GAP_S,
  SCAN_WAIT_S,
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
  createPadRuntime,
  defaultDesktopPadSize,
  defaultHeadsetPadSize,
  disposePadRuntimes,
  flashPad,
  type PadRuntime,
} from './pads.js';
import { WallTonesSequence } from './sequence.js';
import { WALL_TONES_SPEECH, WallTonesSpeech } from './speech.js';
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
  submitPad: (padIndex: number) => void;
};

declare global {
  interface Window {
    __wallTonesDebug?: WallTonesDebugBridge;
  }
}

type SetupMode = 'room-scale' | 'sitting';

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

  private experienceActive = false;
  private flowPhase: FlowPhase = 'inactive';
  private setupMode: SetupMode | null = null;
  private pads: PadRuntime[] = [];
  private playbackQueue: Promise<void> = Promise.resolve();
  private scanStartedAt = -1;
  private airPlaceStep = 0;
  private ghostPad: PadRuntime | null = null;
  private statusText = '';
  private panelBound = false;
  private flatBackdropHidden = false;
  private wasNonImmersive = true;

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
        this.beginRoundAfterDelay(0.5);
      }
    }
    if (this.flowPhase === 'scanning') {
      this.tickScan(delta);
    }
    if (this.flowPhase === 'air-placement') {
      this.tickAirPlacement();
    }
    if (this.game.phase === 'input') {
      if (this.useDesktopInput()) {
        this.readDesktopTouches();
      } else {
        this.readFingertipTouches();
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
    if (getActiveWorldKind() === 'walltones-ar') {
      panel.getElementById('back-to-menu-button')?.addEventListener('click', () => {
        void this.onBackToMenu();
      });
    }
    panel
      .getElementById('mode-room-scale-button')
      ?.addEventListener('click', () => void this.onChooseSetup('room-scale'));
    panel
      .getElementById('mode-sitting-button')
      ?.addEventListener('click', () => void this.onChooseSetup('sitting'));
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
    this.playbackQueue = Promise.resolve();
    this.game.phase = 'idle';
    this.game.resetAllScores();
    this.speech.cancel();
    suspendAudioContext();
    this.clearPads();
    this.ghostPad = null;
    this.setupMode = null;
    this.setFlatHintVisible(false);
    this.showStudioBackdrop();
    this.renderPanel();
  }

  private beginFlatPlay(): void {
    this.flowPhase = 'playing';
    this.statusText = 'Watch the sequence';
    this.setSetupUiVisible(false);
    this.setFlatHintVisible(true);
    this.hideStudioBackdrop();
    this.spawnDesktopPads();
    this.speech.speak(WALL_TONES_SPEECH.desktopReady);
    this.renderPanel();
    this.beginRoundAfterDelay(1.2);
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
    this.clearPads();
    this.speech.speak(line);
    this.speech.speak(WALL_TONES_SPEECH.airPlace(1));
    this.statusText = 'Pinch to place each button.';
    this.spawnGhostPad();
    this.renderPanel();
  }

  private spawnGhostPad(): void {
    this.ghostPad?.entity.dispose({ disposeResources: true });
    this.ghostPad = createPadRuntime(
      this.world,
      (this.airPlaceStep % 4) as WallTonePadId,
      defaultHeadsetPadSize(),
      { rayInteractable: false, anchor: false },
    );
    const face = this.ghostPad.root.getObjectByName('face');
    if (face != null) {
      face.scale.setScalar(0.85);
    }
  }

  private tickAirPlacement(): void {
    const hand = this.preferredPlacementHand();
    if (hand == null || this.ghostPad == null) {
      return;
    }
    this.player.head.getWorldPosition(this.viewer);
    const yaw = this.player.head.rotation.y;
    const offsetX = Math.sin(yaw) * AIR_GHOST_DISTANCE_M;
    const offsetZ = Math.cos(yaw) * AIR_GHOST_DISTANCE_M;
    this.ghostPad.root.position.set(
      this.viewer.x + offsetX,
      this.viewer.y - 0.05,
      this.viewer.z - offsetZ,
    );
    this.ghostPad.root.quaternion.copy(this.player.head.quaternion);

    const select = this.input.xr.getSelectState(hand);
    if (!select.start) {
      return;
    }
    const placed = this.ghostPad;
    placed.entity.addComponent(XRAnchor);
    this.pads.push(placed);
    this.ghostPad = null;
    this.airPlaceStep += 1;
    if (this.airPlaceStep >= 4) {
      this.flowPhase = 'playing';
      this.statusText = 'Playing';
      this.speech.speak(WALL_TONES_SPEECH.gameStart);
      this.beginRoundAfterDelay(0.8);
      this.renderPanel();
      return;
    }
    this.speech.speak(WALL_TONES_SPEECH.airPlace(this.airPlaceStep + 1));
    this.spawnGhostPad();
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
    this.statusText = 'Playing';
    this.speech.speak(line);
    this.speech.speak(WALL_TONES_SPEECH.gameStart);
    this.beginRoundAfterDelay(1);
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
      this.pads.push(pad);
    });
    this.statusText = 'Watch the sequence';
    this.renderPanel();
  }

  private clearPads(): void {
    disposePadRuntimes(this.pads);
    this.ghostPad?.entity.dispose({ disposeResources: true });
    this.ghostPad = null;
  }

  private beginRoundAfterDelay(delayS: number): void {
    this.playbackQueue = this.playbackQueue.then(async () => {
      await this.wait(delayS);
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
    this.statusText = 'Watch the sequence';
    this.renderPanel();
    for (let index = 0; index < this.game.sequence.length; index += 1) {
      const padId = this.game.sequence[index]!;
      const pad = this.pads[padId];
      if (pad != null) {
        flashPad(pad, true);
        playPadTone(padId);
        await this.wait(NOTE_GAP_S + 0.45);
        flashPad(pad, false);
      }
      await this.wait(NOTE_GAP_S);
    }
    this.game.phase = 'input';
    this.game.inputStep = 0;
    this.statusText = 'Your turn';
    this.renderPanel();
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
    for (const pad of this.pads) {
      const hovered = this.entityInQuery(pad.entity, this.queries.padHovered.entities);
      if (!hovered) {
        pad.pointerArmed = true;
        continue;
      }
      const pressed = this.entityInQuery(pad.entity, this.queries.padPressed.entities);
      if (pressed && pad.pointerArmed) {
        pad.pointerArmed = false;
        this.handlePadInput(pad.padIndex);
      }
    }
  }

  private readFingertipTouches(): void {
    for (const pad of this.pads) {
      const inside = this.isFingerInsidePad(pad, 'left') || this.isFingerInsidePad(pad, 'right');
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

  private isFingerInsidePad(pad: PadRuntime, hand: 'left' | 'right'): boolean {
    const adapter = this.input.xr.visualAdapters[hand].peek();
    if (!(adapter instanceof XRHandVisualAdapter)) {
      return false;
    }
    this.player.indexTipSpaces[hand].getWorldPosition(
      hand === 'left' ? this.tipLeft : this.tipRight,
    );
    const tip = hand === 'left' ? this.tipLeft : this.tipRight;
    this.tipLocal.copy(tip);
    pad.touchVolume.worldToLocal(this.tipLocal);
    const hx = pad.touchVolume.scale.x * 0.5;
    const hy = pad.touchVolume.scale.y * 0.5;
    const hz = pad.touchVolume.scale.z * 0.5;
    return (
      Math.abs(this.tipLocal.x) <= hx &&
      Math.abs(this.tipLocal.y) <= hy &&
      Math.abs(this.tipLocal.z) <= hz
    );
  }

  private handlePadInput(padIndex: number): void {
    if (this.game.phase !== 'input') {
      return;
    }
    const expected = this.game.sequence[this.game.inputStep];
    if (expected == null) {
      return;
    }
    const pad = this.pads[padIndex];
    if (pad != null) {
      flashPad(pad, true);
      playPadTone(padIndex);
      window.setTimeout(() => flashPad(pad, false), 350);
    }
    if (padIndex !== expected) {
      void this.onWrongInput();
      return;
    }
    const completed = this.game.onCorrectInput();
    this.renderPanel();
    if (completed) {
      this.speech.speak(WALL_TONES_SPEECH.roundSuccess);
      void this.playSequence();
    }
  }

  private async onWrongInput(): Promise<void> {
    this.game.phase = 'resetting';
    playErrorTone();
    this.speech.speak(WALL_TONES_SPEECH.wrongTouch);
    this.statusText = 'Try again';
    this.renderPanel();
    await this.wait(WRONG_RESET_DELAY_S);
    if (!this.experienceActive) {
      return;
    }
    this.game.onWrongInput();
    this.renderPanel();
    await this.playSequence();
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
