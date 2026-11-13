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
  PANEL_RAY_BLOCK_DEG,
  PANEL_RAY_DODGE_HOLD_MS,
  PANEL_SNAP_ARRIVE_M,
} from './wall-tones/constants.js';
import { riftAimRays, riftTargetPositions } from './rift-lab/rift-targets.js';
import { riftBlockingLineY, type Ray } from './rift-lab/rift-dodge.js';
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

function riftVisibleForFollow(world: {
  getSceneEntity: (id: string) => { getValue: (c: typeof Visibility, k: 'isVisible') => unknown } | undefined;
}): boolean {
  return world.getSceneEntity('rift-lab-panel')?.getValue(Visibility, 'isVisible') === true;
}

/** Gap kept between the lifted panel's bottom edge and the blocking sightline. */
const RIFT_DODGE_CLEAR_M = 0.12;
/**
 * Rift Lab panel half height per unit of entity scale, meters. Measured from
 * the real render (desktop scale 0.34 at 3.75 m, 70 deg vertical fov: panel
 * 1.90 m tall, so 2.79 per unit scale). UIKit sizes the panel, so this is a
 * measurement, not a layout read; the panel is center-anchored.
 */
const RIFT_PANEL_HALF_HEIGHT_PER_SCALE_M = 2.79;
/** Largest lift so the panel never flies out of reach. */
const RIFT_DODGE_MAX_LIFT_M = 1.5;

export class PanelSystem extends createSystem({}) {
  private readonly savedMainMenuPosition = new Float32Array(3);
  private readonly savedMainMenuScale = new Float32Array(3);
  private mainMenuLayoutSaved = false;
  /** When true, flat (non-immersive) layout should be applied. */
  private flatLayoutActive = false;
  private menuAnchored = false;
  private followedMenuId = 'main-menu-panel';
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
  /** Rift Lab panel only: vertical offset currently applied by the ray dodge. */
  private riftDodgeAppliedY = 0;
  private riftDodgeLift = 0;
  private riftDodgeLineY = 0;
  private riftDodgeUntil = 0;
  private readonly riftRayOrigin = new Vector3();
  private readonly riftRayDir = new Vector3();
  private readonly riftRayQuat = new Quaternion();
  private readonly riftScratchA = new Vector3();
  private readonly riftScratchB = new Vector3();

  /**
   * Rift Lab panel follows the player like the menus (his 23:48 Quest test),
   * and, like the setup window, swings up out of the way while a hand ray
   * points at a rift through it (the ray stays clear for the target).
   */
  update(delta: number): void {
    const riftEntity = this.world.getSceneEntity('rift-lab-panel');
    const riftShown =
      riftEntity?.getValue(Visibility, 'isVisible') === true;
    if (riftEntity != null && this.riftDodgeAppliedY !== 0) {
      // Undo last frame's dodge so the follow logic works on the true base.
      riftEntity.getVectorView(Transform, 'position')[1]! -= this.riftDodgeAppliedY;
      this.riftDodgeAppliedY = 0;
    }
    this.updateMenuFollow(delta);
    if (riftEntity == null || !riftShown) {
      this.riftDodgeUntil = 0;
      this.riftDodgeLift = 0;
      return;
    }
    const position = riftEntity.getVectorView(Transform, 'position');
    const immersive =
      this.world.xrEnabled &&
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!immersive) return;
    const now = performance.now();
    const lineY = this.riftBlockingLineY(position);
    if (lineY != null) {
      this.riftDodgeUntil = now + PANEL_RAY_DODGE_HOLD_MS;
      this.riftDodgeLineY = lineY;
    }
    // Ease the lift like the setup panel's lerp. The target puts the panel's
    // BOTTOM edge above the blocking sightline (eye line to the rift, aim ray)
    // plus a margin, using the panel's estimated half height; held after the ray
    // leaves, then eased back down.
    let targetLift = 0;
    if (now < this.riftDodgeUntil) {
      const bottomOffset =
        RIFT_PANEL_HALF_HEIGHT_PER_SCALE_M *
        riftEntity.getVectorView(Transform, 'scale')[1]!;
      targetLift = Math.min(
        RIFT_DODGE_MAX_LIFT_M,
        Math.max(
          0,
          this.riftDodgeLineY + RIFT_DODGE_CLEAR_M + bottomOffset - position[1]!,
        ),
      );
    }
    const alpha = 1 - Math.exp(-delta * 9);
    this.riftDodgeLift += (targetLift - this.riftDodgeLift) * alpha;
    if (Math.abs(this.riftDodgeLift) < 0.001) this.riftDodgeLift = 0;
    this.riftDodgeAppliedY = this.riftDodgeLift;
    position[1]! += this.riftDodgeLift;
  }

  /**
   * True when the Rift Lab panel is in the way: (1) an open-hand aim ray (the
   * beam aims along the palm, published in riftAimRays) or the UI pointer ray
   * passes near a rift while crossing the panel's footprint, or (2) the panel
   * sits between the viewer's eyes and a rift (it occludes the target).
   */
  /** See rift-dodge.ts: aim ray / UI ray / eye line crossing the panel. */
  private riftBlockingLineY(panelPos: ArrayLike<number>): number | null {
    if (riftTargetPositions.length === 0) return null;
    const aimRays: Ray[] = riftAimRays.map((r) => ({
      origin: [r.ox, r.oy, r.oz] as const,
      dir: [r.dx, r.dy, r.dz] as const,
    }));
    const uiRays: Ray[] = [];
    for (const hand of ['right', 'left'] as const) {
      const space = this.player.raySpaces[hand];
      space.updateWorldMatrix(true, false);
      space.getWorldPosition(this.riftRayOrigin);
      space.getWorldQuaternion(this.riftRayQuat);
      this.riftRayDir.set(0, 0, -1).applyQuaternion(this.riftRayQuat);
      uiRays.push({
        origin: [this.riftRayOrigin.x, this.riftRayOrigin.y, this.riftRayOrigin.z],
        dir: [this.riftRayDir.x, this.riftRayDir.y, this.riftRayDir.z],
      });
    }
    this.player.head.getWorldPosition(this.riftScratchA);
    return riftBlockingLineY({
      eye: [this.riftScratchA.x, this.riftScratchA.y, this.riftScratchA.z],
      panel: [panelPos[0]!, panelPos[1]!, panelPos[2]!],
      targets: riftTargetPositions.map((t) => [t.x, t.y, t.z] as const),
      aimRays,
      uiRays,
      blockDeg: PANEL_RAY_BLOCK_DEG,
      lateralM: 0.5,
      riftTopM: 0.45,
    });
  }

  private updateMenuFollow(delta: number): void {
    // The Lab menu replaces the main menu in place, so it follows the player
    // with the same rules. Switching menus re-anchors it in front of the viewer.
    const labVisible =
      this.world.getSceneEntity('lab-menu-panel')?.getValue(Visibility, 'isVisible') === true;
    const baseId = labVisible ? 'lab-menu-panel' : 'main-menu-panel';
    const followId = riftVisibleForFollow(this.world) ? 'rift-lab-panel' : baseId;
    if (followId !== this.followedMenuId) {
      this.followedMenuId = followId;
      this.menuAnchored = false;
      this.menuSnapping = false;
    }
    const entity = this.world.getSceneEntity(followId);
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

    // The Lab menu replaces the main menu in place, so it shares its flat layout.
    const labMenu = this.world.getSceneEntity('lab-menu-panel');
    if (labMenu != null) {
      const lPos = labMenu.getVectorView(Transform, 'position');
      const lScale = labMenu.getVectorView(Transform, 'scale');
      lPos[0] = layout.position[0];
      lPos[1] = layout.position[1];
      lPos[2] = layout.position[2];
      lScale[0] = flatScale;
      lScale[1] = flatScale;
      lScale[2] = flatScale;
    }

    // Lab entry placement per flat layout: desktop has free space to the right
    // of the hub; compact phone viewports width-fill the hub, so the entry
    // moves above it to stay on-screen. XR keeps the scene default.
    const labEntry = this.world.getSceneEntity('lab-entry-panel');
    if (labEntry != null) {
      const ePos = labEntry.getVectorView(Transform, 'position');
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
