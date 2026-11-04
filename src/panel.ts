/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  Transform,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';

/** Main-menu Enter XR is owned by AppModeSystem (starts Wall Tones + launchXR). */
const XR_EXIT_PANEL_NODE_IDS = ['main-menu-panel', 'welcome-panel'] as const;
const XR_LAUNCH_PANEL_NODE_IDS = ['welcome-panel'] as const;

/** Desktop: pull the hub menu closer/larger so Enter XR fills more of the frame. */
const MAIN_MENU_DESKTOP = {
  position: [0, 1.42, -1.55] as const,
  scale: 0.5,
} as const;

/**
 * Phone flat viewports only. Lowered and shrunk so the full hub stays inside
 * an iPhone frame. Desktop and immersive scene transforms are untouched.
 */
const MAIN_MENU_MOBILE = {
  position: [0, 1.05, -2.15] as const,
  scale: 0.26,
} as const;

/**
 * Phone flat viewports only. Width-led so a short desktop/headless window
 * (e.g. 780×493) keeps the desktop hub placement.
 */
function isCompactFlatViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width <= 480) {
    return true;
  }
  if (height <= 480 && width <= 950) {
    return true;
  }
  return false;
}

export class PanelSystem extends createSystem({}) {
  private readonly savedMainMenuPosition = new Float32Array(3);
  private readonly savedMainMenuScale = new Float32Array(3);
  private mainMenuLayoutSaved = false;
  /** When true, flat (non-immersive) layout should be applied. */
  private flatLayoutActive = false;

  init(): void {
    if (!this.world.xrEnabled) {
      for (const nodeId of XR_EXIT_PANEL_NODE_IDS) {
        const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
        panel?.getElementById('xr-button')?.setProperties({ display: 'none' });
        panel
          ?.getElementById('exit-button')
          ?.setProperties({ display: 'none' });
      }
      this.flatLayoutActive = true;
      this.syncMainMenuChrome(true);
      this.applyMainMenuFlatLayout();
      this.bindViewportResize();
      return;
    }

    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();

    for (const nodeId of XR_LAUNCH_PANEL_NODE_IDS) {
      const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
      const xrButton = panel?.getElementById('xr-button');
      if (xrButton == null) {
        continue;
      }
      xrButton.addEventListener('click', launchXR);
      this.cleanupFuncs.push(() =>
        xrButton.removeEventListener('click', launchXR),
      );
    }

    for (const nodeId of XR_EXIT_PANEL_NODE_IDS) {
      const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
      const exitButton = panel?.getElementById('exit-button');
      if (exitButton == null) {
        continue;
      }
      exitButton.addEventListener('click', exitXR);
      this.cleanupFuncs.push(() =>
        exitButton.removeEventListener('click', exitXR),
      );
    }

    const syncForVisibility = (visibilityState: VisibilityState) => {
      const is2D = visibilityState === VisibilityState.NonImmersive;
      this.flatLayoutActive = is2D;
      this.syncMainMenuChrome(is2D);
      this.applyMainMenuFlatLayout();
    };

    syncForVisibility(this.world.visibilityState.peek());
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(syncForVisibility),
    );
    this.bindViewportResize();
  }

  private bindViewportResize(): void {
    const onResize = () => {
      if (!this.flatLayoutActive) {
        return;
      }
      this.syncMainMenuChrome(true);
      this.applyMainMenuFlatLayout();
    };
    window.addEventListener('resize', onResize);
    this.cleanupFuncs.push(() =>
      window.removeEventListener('resize', onResize),
    );
  }

  /**
   * Flat chrome only. Desktop keeps the established large Enter XR; phones use
   * a shorter button so the stack fits. Immersive restores Exit / hides Enter XR.
   * When XR is unavailable (`world.xrEnabled` false), Enter XR stays hidden.
   */
  private syncMainMenuChrome(is2D: boolean): void {
    const mobile = is2D && isCompactFlatViewport();
    const showEnterXr = is2D && this.world.xrEnabled;
    for (const nodeId of XR_EXIT_PANEL_NODE_IDS) {
      const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
      const xrButton = panel?.getElementById('xr-button');
      if (nodeId === 'main-menu-panel' && showEnterXr) {
        xrButton?.setProperties(
          mobile
            ? {
                display: 'flex',
                height: 64,
                paddingTop: 14,
                paddingBottom: 14,
              }
            : {
                display: 'flex',
                height: 96,
                paddingTop: 22,
                paddingBottom: 22,
              },
        );
      } else {
        xrButton?.setProperties({
          display: showEnterXr ? 'flex' : 'none',
        });
      }
      panel
        ?.getElementById('exit-button')
        ?.setProperties({
          display: !is2D && this.world.xrEnabled ? 'flex' : 'none',
        });
    }
  }

  private applyMainMenuFlatLayout(): void {
    const entity = this.world.getSceneEntity('main-menu-panel');
    if (entity == null) {
      return;
    }
    const position = entity.getVectorView(Transform, 'position');
    const scale = entity.getVectorView(Transform, 'scale');
    if (!this.mainMenuLayoutSaved) {
      this.savedMainMenuPosition.set(position);
      this.savedMainMenuScale.set(scale);
      this.mainMenuLayoutSaved = true;
    }
    if (!this.flatLayoutActive) {
      position[0] = this.savedMainMenuPosition[0]!;
      position[1] = this.savedMainMenuPosition[1]!;
      position[2] = this.savedMainMenuPosition[2]!;
      scale[0] = this.savedMainMenuScale[0]!;
      scale[1] = this.savedMainMenuScale[1]!;
      scale[2] = this.savedMainMenuScale[2]!;
      return;
    }
    const layout = isCompactFlatViewport()
      ? MAIN_MENU_MOBILE
      : MAIN_MENU_DESKTOP;
    position[0] = layout.position[0];
    position[1] = layout.position[1];
    position[2] = layout.position[2];
    scale[0] = layout.scale;
    scale[1] = layout.scale;
    scale[2] = layout.scale;
  }
}
