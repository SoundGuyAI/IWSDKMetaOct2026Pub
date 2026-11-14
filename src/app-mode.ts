import { hearingSubtitlesEnabled, colorNamesEnabled, setHearingSubtitles, setColorNames, voicesOffEnabled, setVoicesOff } from './wall-tones/accessibility.js';
/**
 * Switches between the main menu and experience modes by toggling authored
 * scene node visibility. Mode selection lives on spatial UIKitML panels.
 */
import {
  createSystem,
  RayInteractable,
  UIKit,
  UIKitMLAsset,
  Visibility,
  VisibilityState,
} from '@iwsdk/core';

/** Panels whose ray targeting follows their visibility. */
const RAY_TOGGLED_PANEL_IDS: ReadonlySet<string> = new Set([
  'main-menu-panel',
  'wall-tones-panel',
  'nod-lab-panel',
  'nod-lab-entry-panel',
]);
import { primeWallTonesAudioFromGesture } from './wall-tones/audio.js';
import { resetWallTonesStats } from './wall-tones/economy.js';
import { WALL_TONES_BUILD_LABEL } from './build-info.js';
import {
  WallTonesSpeech,
  getVoiceGender,
  setVoiceGender,
  unlockSpeechFromGesture,
  type WallTonesVoiceGender,
} from './wall-tones/speech.js';

export type ExperienceMode = 'menu' | 'demo' | 'meditation' | 'walltones' | 'nodlab';

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
    stored === 'nodlab' ||
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
    // Spatial UIKit clicks are dispatched from the render loop, after Safari's
    // trusted DOM gesture has ended. Resume audio in the original canvas tap
    // instead, before Start changes the mode and queues the welcome.
    const unlockMenuAudio = (event: Event) => {
      if (
        this.mode === 'menu' &&
        event.isTrusted &&
        event.target === this.renderer.domElement
      ) {
        unlockSpeechFromGesture();
      }
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend'] as const) {
      window.addEventListener(type, unlockMenuAudio, { capture: true, passive: true });
      this.cleanupFuncs.push(() =>
        window.removeEventListener(type, unlockMenuAudio, true),
      );
    }
    this.loadingStage('menu', 'Scene and renderer loaded. Wiring the menu controls.');
    const menuPanel = this.bindMainMenu();
    this.bindWallTonesPlaceholder();
    this.bindDemoNav();
    this.bindWelcomeBack();
    this.applyMode(this.mode, false);
    // Static splash in index.html stays up until the menu is usable: buttons
    // are wired (above) AND the menu text can actually render. Panel text
    // waits on the Inter MSDF font chunk, which can arrive seconds after
    // init on slow connections - lifting earlier shows an icon-only menu.
    // If the font never loads, the splash's own timeout shows a retry state.
    this.liftSplashWhenMenuTextLoads(menuPanel);
  }

  private loadingStage(key: string, detail: string): void {
    (window as unknown as { __wtLoading?: { stage: (key: string, detail: string) => void } }).__wtLoading?.stage(key, detail);
  }

  private liftSplashWhenMenuTextLoads(panel: UIKitMLAsset | null): void {
    const lift = () => {
      (
        window as unknown as { __wtAppReady?: () => void }
      ).__wtAppReady?.();
    };
    if (panel == null) {
      (window as unknown as { __wtLoading?: { fail: (error: unknown) => void } }).__wtLoading?.fail('Main menu panel is missing.');
      return;
    }
    // Every text element on the menu panel exposes a fontSignal that resolves
    // once its MSDF font data has loaded. Wait for all of them, then give the
    // renderer a frame so glyphs are on screen before the splash fades.
    const texts: Array<{ fontSignal: { value: unknown } }> = [];
    panel.traverse((object) => {
      const candidate = object as unknown as {
        fontSignal?: { value: unknown };
      };
      if (candidate.fontSignal != null) {
        texts.push(candidate as { fontSignal: { value: unknown } });
      }
    });
    // Subscribe after counting, and defer completion out of subscribe's
    // immediate callback. This also avoids a synchronous unsubscribe TDZ.
    const pending = texts.filter((text) => text.fontSignal.value == null);
    let remaining = pending.length;
    const update = () => this.loadingStage('fonts',
      'Menu controls wired. Menu text fonts ready: ' + (texts.length - remaining) + '/' + texts.length + '.');
    const renderThenLift = () => {
      this.loadingStage('render', 'Menu fonts loaded. Waiting for the first readable frame.');
      requestAnimationFrame(() => requestAnimationFrame(lift));
    };
    update();
    if (remaining === 0) {
      renderThenLift();
      return;
    }
    for (const text of pending) {
      const fontSignal = text.fontSignal as {
        value: unknown;
        subscribe: (fn: () => void) => () => void;
      };
      let resolved = false;
      const unsubscribe = fontSignal.subscribe(() => {
        if (fontSignal.value == null || resolved) return;
        resolved = true;
        queueMicrotask(() => {
          unsubscribe();
          remaining -= 1;
          update();
          if (remaining === 0) renderThenLift();
        });
      });
      this.cleanupFuncs.push(unsubscribe);
    }
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
    const showNodLab = mode === 'nodlab';

    this.setNodeVisible('main-menu-panel', showMenu);
    this.setNodeVisible('wall-tones-panel', showWallTones);
    this.setNodeVisible('nod-lab-panel', showNodLab);
    // Lab entry floats under the menu: visible exactly when the menu is.
    this.setNodeVisible('nod-lab-entry-panel', showMenu);

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
    // A hidden panel must not stay ray-targetable: an invisible panel placed
    // nearer than the visible one can intercept the controller ray.
    if (RAY_TOGGLED_PANEL_IDS.has(nodeId)) {
      if (visible && !entity.hasComponent(RayInteractable)) {
        entity.addComponent(RayInteractable);
      } else if (!visible && entity.hasComponent(RayInteractable)) {
        entity.removeComponent(RayInteractable);
      }
    }
  }

  private startWallTonesFlat(): void {
    primeWallTonesAudioFromGesture();
    unlockSpeechFromGesture();
    this.setMode('walltones');
  }

  /** Enter XR prepares an MR menu; Start remains a separate choice. */
  private enterXrIntoWallTones(): void {
    void import('./wall-tones/world-host.js').then(async (host) => {
      await host.switchToWallTonesArWorld('menu');
    }).catch((error) => {
      console.error('[wall-tones] XR preparation failed', error);
      // No game state was selected. Keep the menu available for another try.
    });
  }

  private bindMainMenu(): UIKitMLAsset | null {
    const panel = this.world.getSceneObject<UIKitMLAsset>('main-menu-panel');
    if (panel == null) {
      return null;
    }
    const wallTonesButton = panel.getElementById('mode-walltones-button');
    const xrButton = panel.getElementById('xr-button');
    wallTonesButton?.addEventListener('click', () => this.startWallTonesFlat());
    xrButton?.addEventListener('click', () => this.enterXrIntoWallTones());
    this.bindNodLabEntry();
    this.bindNodLabBack();
    this.bindSettingsMenu(panel);
    if (wallTonesButton != null) {
      wallTonesButton.name = 'Btn_ModeWallTones';
    }
    if (xrButton != null) {
      xrButton.name = 'Btn_EnterXrWallTones';
    }
    return panel;
  }

  // The lab entry is its own compact panel under the main menu, NOT a button
  // inside main-menu.uikitml: the desktop e2e specs click the menu buttons at
  // calibrated pixel coordinates and the centre-anchored panel would shift
  // them if another in-flow button were added.
  private bindNodLabEntry(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('nod-lab-entry-panel');
    const nodLabButton = panel?.getElementById('nod-lab-button');
    nodLabButton?.addEventListener('click', () => {
      primeWallTonesAudioFromGesture();
      unlockSpeechFromGesture();
      this.setMode('nodlab');
    });
    if (nodLabButton != null) {
      nodLabButton.name = 'Btn_NodLab';
    }
  }

  private bindNodLabBack(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('nod-lab-panel');
    const back = panel?.getElementById('nod-lab-back-button');
    back?.addEventListener('click', () => this.setMode('menu'));
    if (back != null) {
      back.name = 'Btn_NodLabBackToMenu';
    }
  }

  /**
   * Settings submenu on the main menu (gear button). UIKitML has no overlay, so
   * the submenu swaps in for the menu content and Back swaps it out again.
   */
  private bindSettingsMenu(panel: UIKitMLAsset): void {
    const setDisplay = (id: string, display: 'flex' | 'none') =>
      panel.getElementById(id)?.setProperties({ display });
    // Build identity from vite.config.ts define; read-only, for test reports.
    panel
      .getElementById<UIKit.Text>('settings-version')
      ?.setProperties({ text: WALL_TONES_BUILD_LABEL });
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
        'main-menu-credit',
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
      setDisplay('main-menu-credit', 'flex');
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
    panel.getElementById('accessibility-button')?.addEventListener('click', () => {
      setDisplay('settings-dialog', 'none');
      setDisplay('accessibility-dialog', 'flex');
    });
    panel.getElementById('accessibility-back-button')?.addEventListener('click', () => {
      setDisplay('accessibility-dialog', 'none');
      setDisplay('settings-dialog', 'flex');
    });
    panel.getElementById('hearing-subtitles-checkbox')?.setProperties({
      checked: hearingSubtitlesEnabled(),
      onCheckedChange: setHearingSubtitles,
    } as never);
    panel.getElementById('color-names-checkbox')?.setProperties({
      checked: colorNamesEnabled(),
      onCheckedChange: setColorNames,
    } as never);
    panel.getElementById('voices-off-checkbox')?.setProperties({
      checked: voicesOffEnabled(),
      onCheckedChange: setVoicesOff,
    } as never);
    // Debug stat reset: two-step confirm, clears progression stats only.
    let resetArmed = false;
    let resetDisarm: number | undefined;
    panel.getElementById('reset-stats-button')?.addEventListener('click', () => {
      const label = panel.getElementById('reset-stats-label');
      if (!resetArmed) {
        resetArmed = true;
        label?.setProperties({ text: 'Tap again to confirm reset' } as never);
        resetDisarm = window.setTimeout(() => {
          resetArmed = false;
          label?.setProperties({ text: 'Reset my stats (debug)' } as never);
        }, 4000);
        return;
      }
      window.clearTimeout(resetDisarm);
      resetWallTonesStats();
      window.location.reload();
    });
    const syncAccessibility = () => {
      if (voicesOffEnabled()) this.voicePreview.cancel();
      panel.getElementById('hearing-subtitles-checkbox')?.setProperties({ checked: hearingSubtitlesEnabled() } as never);
      panel.getElementById('color-names-checkbox')?.setProperties({ checked: colorNamesEnabled() } as never);
      panel.getElementById('voices-off-checkbox')?.setProperties({ checked: voicesOffEnabled() } as never);
    };
    window.addEventListener('wall-tones-accessibility-change', syncAccessibility);
    this.cleanupFuncs.push(() => window.removeEventListener('wall-tones-accessibility-change', syncAccessibility));
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
      menu: 'Wall Tones 2: too fast to wall',
      demo: 'Starter demo',
      meditation: 'Breath & gaze rest',
      walltones: 'Wall Tones 2: too fast to wall',
      nodlab: 'Wall Tones 2: nod yes/no lab',
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
