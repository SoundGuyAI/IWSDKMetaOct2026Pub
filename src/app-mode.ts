/**
 * Switches between the main menu and experience modes by toggling authored
 * scene node visibility. Mode selection lives on spatial UIKitML panels.
 */
import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  Visibility,
  VisibilityState,
} from '@iwsdk/core';
import { primeWallTonesAudioFromGesture } from './wall-tones/audio.js';
import {
  WallTonesSpeech,
  getVoiceGender,
  setVoiceGender,
  unlockSpeechFromGesture,
  type WallTonesVoiceGender,
} from './wall-tones/speech.js';

export type ExperienceMode = 'menu' | 'demo' | 'meditation' | 'walltones';

const MODE_STORAGE_KEY = 'iwsdk-experience-mode';

const DEMO_NODE_IDS = [
  'grab-plinth',
  'select-plinth',
  'spin-plinth',
] as const;

const MEDITATION_NODE_IDS = ['welcome-panel', 'gaze-debug-panel'] as const;

const DEMO_NAV_ID = 'demo-nav-panel';

function readStoredMode(): ExperienceMode {
  if (typeof sessionStorage === 'undefined') {
    return 'menu';
  }
  const stored = sessionStorage.getItem(MODE_STORAGE_KEY);
  if (
    stored === 'demo' ||
    stored === 'meditation' ||
    stored === 'walltones' ||
    stored === 'menu'
  ) {
    return stored;
  }
  return 'menu';
}

function persistMode(mode: ExperienceMode): void {
  sessionStorage.setItem(MODE_STORAGE_KEY, mode);
}

export class AppModeSystem extends createSystem({}) {
  private mode: ExperienceMode = 'menu';
  private readonly voicePreview = new WallTonesSpeech();

  init(): void {
    this.mode = readStoredMode();
    this.bindMainMenu();
    this.bindWallTonesPlaceholder();
    this.bindDemoNav();
    this.bindWelcomeBack();
    this.applyMode(this.mode, false);
  }

  private setMode(mode: ExperienceMode): void {
    if (mode === this.mode) {
      return;
    }
    this.applyMode(mode, true);
  }

  private applyMode(mode: ExperienceMode, dispatchEvent: boolean): void {
    this.mode = mode;
    persistMode(mode);

    const showMenu = mode === 'menu';
    const showDemo = mode === 'demo';
    const showMeditation = mode === 'meditation';
    const showWallTones = mode === 'walltones';

    this.setNodeVisible('main-menu-panel', showMenu);
    this.setNodeVisible('wall-tones-panel', showWallTones);

    for (const nodeId of DEMO_NODE_IDS) {
      this.setNodeVisible(nodeId, showDemo);
    }
    this.setNodeVisible(DEMO_NAV_ID, showDemo);

    for (const nodeId of MEDITATION_NODE_IDS) {
      this.setNodeVisible(nodeId, showMeditation);
    }

    this.syncDocumentChrome(mode);

    if (dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('experience-mode-changed', { detail: { mode } }),
      );
    }
  }

  private setNodeVisible(nodeId: string, visible: boolean): void {
    const entity = this.world.getSceneEntity(nodeId);
    if (entity == null) {
      return;
    }
    entity.setValue(Visibility, 'isVisible', visible);
  }

  private startWallTonesFlat(): void {
    primeWallTonesAudioFromGesture();
    unlockSpeechFromGesture();
    this.setMode('walltones');
  }

  /**
   * Enter XR boots the AR Wall Tones world first (while still flat), then
   * launches one XR session — so later mode picks never tear XR down.
   * Dynamic import avoids a circular dependency with world-host.
   */
  private enterXrIntoWallTones(): void {
    primeWallTonesAudioFromGesture();
    unlockSpeechFromGesture();
    persistMode('walltones');
    sessionStorage.setItem('wall-tones-awaiting-mode', '1');
    void import('./wall-tones/world-host.js').then((host) => {
      if (host.getActiveWorldKind() === 'hub-vr') {
        void host.switchToWallTonesArWorld();
        return;
      }
      this.setMode('walltones');
      if (this.world.xrEnabled) {
        this.world.launchXR();
      }
    });
  }

  private bindMainMenu(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('main-menu-panel');
    if (panel == null) {
      return;
    }
    const wallTonesButton = panel.getElementById('mode-walltones-button');
    const xrButton = panel.getElementById('xr-button');
    wallTonesButton?.addEventListener('click', () => this.startWallTonesFlat());
    xrButton?.addEventListener('click', () => this.enterXrIntoWallTones());
    this.bindSettingsMenu(panel);
    if (wallTonesButton != null) {
      wallTonesButton.name = 'Btn_ModeWallTones';
    }
    if (xrButton != null) {
      xrButton.name = 'Btn_EnterXrWallTones';
    }
  }

  /**
   * Settings submenu on the main menu (gear button). UIKitML has no overlay, so
   * the submenu swaps in for the menu content and Back swaps it out again.
   */
  private bindSettingsMenu(panel: UIKitMLAsset): void {
    const setDisplay = (id: string, display: 'flex' | 'none') =>
      panel.getElementById(id)?.setProperties({ display });
    const syncVoiceLabels = () => {
      const gender = getVoiceGender();
      panel
        .getElementById<UIKit.Text>('voice-male-label')
        ?.setProperties({
          text: gender === 'male' ? 'Male voice (selected)' : 'Male voice',
        });
      panel
        .getElementById<UIKit.Text>('voice-female-label')
        ?.setProperties({
          text: gender === 'female' ? 'Female voice (selected)' : 'Female voice',
        });
    };
    const open = () => {
      for (const id of [
        'main-menu-content',
        'mode-walltones-button',
        'xr-button',
        'exit-button',
        'settings-button',
      ]) {
        setDisplay(id, 'none');
      }
      syncVoiceLabels();
      setDisplay('settings-dialog', 'flex');
    };
    const close = () => {
      setDisplay('settings-dialog', 'none');
      const flat =
        this.world.visibilityState.peek() === VisibilityState.NonImmersive;
      setDisplay('main-menu-content', 'flex');
      setDisplay('mode-walltones-button', 'flex');
      setDisplay('settings-button', 'flex');
      // Same rule PanelSystem uses: Enter XR on flat, Exit while immersive.
      setDisplay('xr-button', flat && this.world.xrEnabled ? 'flex' : 'none');
      setDisplay('exit-button', !flat && this.world.xrEnabled ? 'flex' : 'none');
    };
    const choose = (gender: WallTonesVoiceGender) => {
      unlockSpeechFromGesture();
      setVoiceGender(gender);
      syncVoiceLabels();
      // Preview the pick in the new voice.
      this.voicePreview.cancel();
      this.voicePreview.speak('welcome');
    };
    panel.getElementById('settings-button')?.addEventListener('click', open);
    panel
      .getElementById('settings-back-button')
      ?.addEventListener('click', close);
    panel
      .getElementById('voice-male-button')
      ?.addEventListener('click', () => choose('male'));
    panel
      .getElementById('voice-female-button')
      ?.addEventListener('click', () => choose('female'));
    syncVoiceLabels();
  }

  private bindWallTonesPlaceholder(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('wall-tones-panel');
    const back = panel?.getElementById('back-to-menu-button');
    back?.addEventListener('click', () => this.setMode('menu'));
    if (back != null) {
      back.name = 'Btn_BackToMenu';
    }
  }

  private bindDemoNav(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>(DEMO_NAV_ID);
    const back = panel?.getElementById('demo-back-button');
    back?.addEventListener('click', () => this.setMode('menu'));
    if (back != null) {
      back.name = 'Btn_DemoBackToMenu';
    }
  }

  private bindWelcomeBack(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const back = panel?.getElementById('back-to-menu-button');
    back?.addEventListener('click', () => this.setMode('menu'));
    if (back != null) {
      back.name = 'Btn_MeditationBackToMenu';
    }
  }

  private syncDocumentChrome(mode: ExperienceMode): void {
    const titles: Record<ExperienceMode, string> = {
      menu: 'Wall Tones',
      demo: 'Starter demo',
      meditation: 'Breath & gaze rest',
      walltones: 'Wall Tones',
    };
    document.title = titles[mode];

    const welcomeBack = this.world
      .getSceneObject<UIKitMLAsset>('welcome-panel')
      ?.getElementById('back-to-menu-button');
    welcomeBack?.setProperties({
      display: mode === 'meditation' ? 'flex' : 'none',
    });
  }
}
