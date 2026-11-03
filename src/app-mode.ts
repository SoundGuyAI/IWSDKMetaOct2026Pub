/**
 * Switches between the main menu and the three experience modes by toggling
 * authored scene node visibility. Mode selection lives on spatial UIKitML panels,
 * which are ray- and pointer-interactable in both desktop WebGL and XR.
 */
import {
  createSystem,
  UIKitMLAsset,
  Visibility,
} from '@iwsdk/core';

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

  private bindMainMenu(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('main-menu-panel');
    if (panel == null) {
      return;
    }
    const demoButton = panel.getElementById('mode-demo-button');
    const meditationButton = panel.getElementById('mode-meditation-button');
    const wallTonesButton = panel.getElementById('mode-walltones-button');
    demoButton?.addEventListener('click', () => this.setMode('demo'));
    meditationButton?.addEventListener('click', () =>
      this.setMode('meditation'),
    );
    wallTonesButton?.addEventListener('click', () =>
      this.setMode('walltones'),
    );
    if (demoButton != null) {
      demoButton.name = 'Btn_ModeDemo';
    }
    if (meditationButton != null) {
      meditationButton.name = 'Btn_ModeMeditation';
    }
    if (wallTonesButton != null) {
      wallTonesButton.name = 'Btn_ModeWallTones';
    }
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
      menu: 'Experience hub',
      demo: 'Starter demo',
      meditation: 'Breath & gaze rest',
      walltones: 'Wall Tones (planned)',
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
