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

const XR_PANEL_NODE_IDS = ['main-menu-panel', 'welcome-panel'] as const;

/** Desktop: pull the hub menu closer/larger so Enter XR fills more of the frame. */
const MAIN_MENU_DESKTOP = {
  position: [0, 1.42, -1.55] as const,
  scale: 0.5,
} as const;

export class PanelSystem extends createSystem({}) {
  private readonly savedMainMenuPosition = new Float32Array(3);
  private readonly savedMainMenuScale = new Float32Array(3);
  private mainMenuLayoutSaved = false;

  init(): void {
    if (!this.world.xrEnabled) {
      for (const nodeId of XR_PANEL_NODE_IDS) {
        const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
        panel?.getElementById('xr-button')?.setProperties({ display: 'none' });
        panel
          ?.getElementById('exit-button')
          ?.setProperties({ display: 'none' });
      }
      // Still bring the menu forward on desktop builds without XR.
      this.applyMainMenuDesktopLayout(true);
      return;
    }

    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();

    for (const nodeId of XR_PANEL_NODE_IDS) {
      const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
      const xrButton = panel?.getElementById('xr-button');
      const exitButton = panel?.getElementById('exit-button');
      if (xrButton == null || exitButton == null) {
        continue;
      }
      xrButton.addEventListener('click', launchXR);
      exitButton.addEventListener('click', exitXR);
      this.cleanupFuncs.push(
        () => xrButton.removeEventListener('click', launchXR),
        () => exitButton.removeEventListener('click', exitXR),
      );
    }

    const syncForVisibility = (visibilityState: VisibilityState) => {
      const is2D = visibilityState === VisibilityState.NonImmersive;
      for (const nodeId of XR_PANEL_NODE_IDS) {
        const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
        const xrButton = panel?.getElementById('xr-button');
        xrButton?.setProperties({
          display: is2D ? 'flex' : 'none',
          ...(nodeId === 'main-menu-panel' && is2D
            ? { height: 96, paddingTop: 22, paddingBottom: 22 }
            : {}),
        });
        panel
          ?.getElementById('exit-button')
          ?.setProperties({ display: is2D ? 'none' : 'flex' });
      }
      this.applyMainMenuDesktopLayout(is2D);
    };

    syncForVisibility(this.world.visibilityState.peek());
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(syncForVisibility),
    );
  }

  private applyMainMenuDesktopLayout(useDesktop: boolean): void {
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
    if (useDesktop) {
      position[0] = MAIN_MENU_DESKTOP.position[0];
      position[1] = MAIN_MENU_DESKTOP.position[1];
      position[2] = MAIN_MENU_DESKTOP.position[2];
      scale[0] = MAIN_MENU_DESKTOP.scale;
      scale[1] = MAIN_MENU_DESKTOP.scale;
      scale[2] = MAIN_MENU_DESKTOP.scale;
      return;
    }
    position[0] = this.savedMainMenuPosition[0]!;
    position[1] = this.savedMainMenuPosition[1]!;
    position[2] = this.savedMainMenuPosition[2]!;
    scale[0] = this.savedMainMenuScale[0]!;
    scale[1] = this.savedMainMenuScale[1]!;
    scale[2] = this.savedMainMenuScale[2]!;
  }
}
