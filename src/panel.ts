/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';

const XR_PANEL_NODE_IDS = ['main-menu-panel', 'welcome-panel'] as const;

export class PanelSystem extends createSystem({}) {
  init(): void {
    if (!this.world.xrEnabled) {
      for (const nodeId of XR_PANEL_NODE_IDS) {
        const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
        panel?.getElementById('xr-button')?.setProperties({ display: 'none' });
        panel
          ?.getElementById('exit-button')
          ?.setProperties({ display: 'none' });
      }
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

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        for (const nodeId of XR_PANEL_NODE_IDS) {
          const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
          panel
            ?.getElementById('xr-button')
            ?.setProperties({ display: is2D ? 'flex' : 'none' });
          panel
            ?.getElementById('exit-button')
            ?.setProperties({ display: is2D ? 'none' : 'flex' });
        }
      }),
    );
  }
}
