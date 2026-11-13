/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

import {
  createSystem,
  Transform,
  UIKitMLAsset,
  Visibility,
  VisibilityState,
} from '@iwsdk/core';
import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  PANEL_FOLLOW_DISTANCE_M,
  PANEL_FOLLOW_SCALE,
  PANEL_FOLLOW_SLERP,
  PANEL_FOLLOW_Y_OFFSET_M,
  PANEL_LOOK_AWAY_DEG,
  PANEL_SNAP_ARRIVE_M,
} from './wall-tones/constants.js';
import { horizontalLookAway } from './wall-tones/panel-placement.js';
import { enterXrButtonVisible } from './enter-xr-visibility.js';

/** Main-menu Enter XR is owned by AppModeSystem (starts Wall Tones + launchXR). */
const XR_EXIT_PANEL_NODE_IDS = ['main-menu-panel', 'welcome-panel'] as const;
const XR_LAUNCH_PANEL_NODE_IDS = ['welcome-panel'] as const;

/** Desktop: pull the hub menu closer/larger so Enter XR fills more of the frame. */
const MAIN_MENU_DESKTOP = {
  position: [0, 1.42, -1.55] as const,
  scale: 0.5,
} as const;

/**
 * Phone flat viewports only. Width-fit with side padding so the hub fills
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
  private menuAnchored = false;
  private menuSnapping = false;
  private readonly menuViewer = new Vector3();
  private readonly menuForward = new Vector3();
  private readonly menuHeadQuat = new Quaternion();
  private readonly menuPos = new Vector3();
  private readonly menuTargetPos = new Vector3();
  private readonly menuQuat = new Quaternion();
  private readonly menuTargetQuat = new Quaternion();
  private readonly menuMatrix = new Matrix4();
  private readonly menuUp = new Vector3(0, 1, 0);

  /**
   * Item 47: in immersive XR the startup main menu follows the player with the
   * same placement rules as the in-game panel (distance, height offset, scale,
   * look-away threshold, eased snap). Flat layouts are untouched.
   */
  update(delta: number): void {
    const entity = this.world.getSceneEntity('main-menu-panel');
    const immersive =
      this.world.xrEnabled &&
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (
      entity == null ||
      !immersive ||
      entity.getValue(Visibility, 'isVisible') !== true
    ) {
      this.menuAnchored = false;
      this.menuSnapping = false;
      return;
    }
    const position = entity.getVectorView(Transform, 'position');
    const orientation = entity.getVectorView(Transform, 'orientation');
    const scale = entity.getVectorView(Transform, 'scale');
    this.player.head.getWorldPosition(this.menuViewer);
    this.player.head.getWorldQuaternion(this.menuHeadQuat);
    this.menuForward.set(0, 0, -1).applyQuaternion(this.menuHeadQuat).setY(0);
    if (this.menuForward.lengthSq() < 1e-6) {
      this.menuForward.set(0, 0, -1);
    }
    this.menuForward.normalize();
    this.menuPos.set(position[0]!, position[1]!, position[2]!);
    if (
      !this.menuAnchored ||
      (!this.menuSnapping &&
        horizontalLookAway(this.menuViewer, this.menuForward, this.menuPos) >=
          PANEL_LOOK_AWAY_DEG)
    ) {
      this.menuTargetPos
        .copy(this.menuViewer)
        .addScaledVector(this.menuForward, PANEL_FOLLOW_DISTANCE_M);
      this.menuTargetPos.y = this.menuViewer.y + PANEL_FOLLOW_Y_OFFSET_M;
      this.menuMatrix.lookAt(this.menuViewer, this.menuTargetPos, this.menuUp);
      this.menuTargetQuat.setFromRotationMatrix(this.menuMatrix);
      this.menuSnapping = true;
      if (!this.menuAnchored) {
        this.menuPos.copy(this.menuTargetPos);
        this.menuQuat.copy(this.menuTargetQuat);
        this.menuAnchored = true;
      } else {
        this.menuQuat.set(
          orientation[0]!,
          orientation[1]!,
          orientation[2]!,
          orientation[3]!,
        );
      }
    }
    if (!this.menuSnapping) {
      return;
    }
    const alpha =
      1 - Math.pow(1 - PANEL_FOLLOW_SLERP, Math.max(delta, 1 / 120) * 72);
    this.menuPos.lerp(this.menuTargetPos, alpha);
    this.menuQuat.slerp(this.menuTargetQuat, alpha);
    position[0] = this.menuPos.x;
    position[1] = this.menuPos.y;
    position[2] = this.menuPos.z;
    orientation[0] = this.menuQuat.x;
    orientation[1] = this.menuQuat.y;
    orientation[2] = this.menuQuat.z;
    orientation[3] = this.menuQuat.w;
    scale[0] = scale[1] = scale[2] = PANEL_FOLLOW_SCALE;
    if (this.menuPos.distanceTo(this.menuTargetPos) <= PANEL_SNAP_ARRIVE_M) {
      this.menuSnapping = false;
    }
  }

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
   * Flat chrome only. Desktop keeps the established large Enter XR; phones
   * (compact flat viewports) hide Enter XR entirely - the owner requested a flat-only mobile menu. Immersive restores Exit / hides Enter XR. When XR is
   * unavailable (`world.xrEnabled` false), Enter XR stays hidden.
   */
  private syncMainMenuChrome(is2D: boolean): void {
    const showEnterXr = enterXrButtonVisible(
      is2D,
      this.world.xrEnabled,
      is2D && isCompactFlatViewport(),
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
    );
    for (const nodeId of XR_EXIT_PANEL_NODE_IDS) {
      const panel = this.world.getSceneObject<UIKitMLAsset>(nodeId);
      const xrButton = panel?.getElementById('xr-button');
      if (nodeId === 'main-menu-panel' && showEnterXr) {
        xrButton?.setProperties({
          display: 'flex',
          height: 96,
          paddingTop: 22,
          paddingBottom: 22,
        });
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
    let flatScale: number = layout.scale;
    if (isCompactFlatViewport()) {
      // 520 cm authored width; 90% of the frustum leaves 5% padding per side.
      // Limit height in landscape instead of cropping the controls.
      const camera = this.world.camera;
      const fov = 'fov' in camera ? Number(camera.fov) : 70;
      const depth = Math.abs(camera.position.z - layout.position[2]);
      const frustumHeight = 2 * depth * Math.tan(fov * Math.PI / 360);
      flatScale = Math.min(frustumHeight * (window.innerWidth / window.innerHeight) * 0.9 / 5.2,
        frustumHeight * 0.86 / 6.2);
    }
    scale[0] = flatScale;
    scale[1] = flatScale;
    scale[2] = flatScale;

    // Lab entry placement per flat layout: desktop has free space to the
    // right of the hub; compact phone viewports width-fill the hub, so the
    // entry moves above it to stay on-screen. XR keeps the scene default.
    const entry = this.world.getSceneEntity('thumbs-lab-entry-panel');
    if (entry != null) {
      const ePos = entry.getVectorView(Transform, 'position');
      if (isCompactFlatViewport()) {
        ePos[0] = 0;
        ePos[1] = 3.55;
      } else {
        ePos[0] = 4.15;
        ePos[1] = 0;
      }
    }
  }
}
