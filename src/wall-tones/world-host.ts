import {
  ReferenceSpaceType,
  SessionMode,
  World,
  type WorldOptions,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { showXrEntryGate } from './xr-entry.js';
import { recordXrEvent } from './xr-diagnostics.js';
import { AppModeSystem, type ExperienceMode } from '../app-mode.js';
import { GuidedSensingSystem } from '../guided-sensing.js';
import { PanelSystem } from '../panel.js';
import { RobotSystem } from '../robot.js';
import { WallTonesSystem } from './wall-tones-system.js';

export { backToMenuDestroysWorld } from './back-to-menu-policy.js';

const MODE_STORAGE_KEY = 'iwsdk-experience-mode';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export type ActiveWorldKind = 'hub-vr' | 'walltones-ar';

let sceneContainer: HTMLElement | null = null;
let activeWorld: World | null = null;
let activeKind: ActiveWorldKind = 'hub-vr';
let bootPromise: Promise<World> | null = null;
/** Serialize world swaps so overlapping Enter XR / mode clicks cannot double-destroy. */
let switchChain: Promise<unknown> = Promise.resolve();

function registerHubSystems(world: World): void {
  world.registerSystem(AppModeSystem);
  world.registerSystem(GuidedSensingSystem);
  world.registerSystem(RobotSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(WallTonesSystem);
}

function registerArSystems(world: World): void {
  world.registerSystem(AppModeSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(WallTonesSystem);
}

function buildArWorldOptions(): WorldOptions {
  const baseXr =
    projectOptions.xr === false
      ? {}
      : { ...(projectOptions.xr ?? {}) };

  return {
    ...projectOptions,
    level: publicAssetUrl('scenes/wall-tones-ar.iwsdk.scene.json'),
    xr: {
      ...baseXr,
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none',
      // Prefer an unbounded tracking space in MR (backlog 20): it declares a
      // move-freely experience instead of one tied to the guardian's bounded
      // floor area. Fallback keeps local-floor behavior when unbounded is not
      // granted, so wall/table placement is unchanged there.
      referenceSpace: {
        type: ReferenceSpaceType.Unbounded,
        fallbackOrder: [
          ReferenceSpaceType.LocalFloor,
          ReferenceSpaceType.Local,
          ReferenceSpaceType.Viewer,
        ],
      },
      features: {
        handTracking: true,
        planeDetection: true,
        meshDetection: true,
        anchors: true,
        hitTest: true,
        // Ask the UA for the unbounded space; granted only where supported.
        unbounded: true,
      },
    },
    features: {
      ...(projectOptions.features ?? {}),
      locomotion: false,
      grabbing: false,
      physics: false,
      sceneUnderstanding: {
        showWireFrame: false,
      },
      environmentRaycast: true,
    },
  };
}

export function getSceneContainer(): HTMLElement | null {
  return sceneContainer;
}

export function getActiveWorld(): World | null {
  return activeWorld;
}

export function getActiveWorldKind(): ActiveWorldKind {
  return activeKind;
}

async function destroyActiveWorld(): Promise<void> {
  if (activeWorld == null) {
    return;
  }
  try {
    activeWorld.exitXR();
  } catch {
    // Session may already be ending during a world swap.
  }
  const staleCanvas = activeWorld.renderer?.domElement;
  activeWorld.destroy();
  activeWorld = null;
  // world.destroy() leaves its canvas in the container. A stale canvas keeps
  // catching the pointer after the next world is built (menu looks alive but
  // never reacts once an XR session has ended), so drop it with the world.
  if (staleCanvas != null && staleCanvas.isConnected) {
    recordXrEvent('stale-canvas-removed');
    staleCanvas.remove();
  }
}

export async function bootHubWorld(container: HTMLElement): Promise<World> {
  sceneContainer = container;
  await destroyActiveWorld();
  activeKind = 'hub-vr';
  const world = await World.create(container, projectOptions);
  registerHubSystems(world);
  activeWorld = world;
  return world;
}

/**
 * Tear down the hub and boot the AR/passthrough Wall Tones world, then enter XR once.
 * Call this while still NonImmersive (e.g. from Enter XR) so mode select never mid-session destroys XR.
 */
export async function switchToWallTonesArWorld(entry: 'menu' | 'setup' = 'setup'): Promise<World> {
  const run = switchChain.then(async () => {
    if (sceneContainer == null) {
      throw new Error('Scene container is not initialized');
    }
    recordXrEvent('switch-to-ar', `entry=${entry} kind=${activeKind} reuse=${activeKind === 'walltones-ar' && activeWorld != null}`);
    if (activeKind === 'walltones-ar' && activeWorld != null) {
      showXrEntryGate(activeWorld);
      return activeWorld;
    }
    sessionStorage.setItem(MODE_STORAGE_KEY, entry === 'menu' ? 'menu' : 'walltones');
    if (entry === 'menu') {
      sessionStorage.removeItem('wall-tones-awaiting-mode');
      sessionStorage.removeItem('wall-tones-setup-mode');
    }
    await destroyActiveWorld();
    // Kind must be walltones-ar before registerSystem so WallTonesSystem.init /
    // bindPanelIfNeeded see the AR world (not a stale hub-vr kind).
    activeKind = 'walltones-ar';
    const world = await World.create(sceneContainer, buildArWorldOptions());
    registerArSystems(world);
    activeWorld = world;
    showXrEntryGate(world);
    return world;
  });
  switchChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Full hub reboot (destroys the active world). Do not use for in-session
 * Wall Tones "Back to menu" — that must keep the live AR world so XRPlane /
 * XRMesh scan data and the immersive session survive (backlog #58).
 */
export async function switchBackToHubMenu(options?: {
  reenterXr?: boolean;
}): Promise<World> {
  const reenterXr = options?.reenterXr === true;
  const run = switchChain.then(async () => {
    sessionStorage.setItem(MODE_STORAGE_KEY, 'menu');
    sessionStorage.removeItem('wall-tones-awaiting-mode');
    sessionStorage.removeItem('wall-tones-setup-mode');
    sessionStorage.removeItem('wall-tones-dominant-hand');
    if (sceneContainer == null) {
      throw new Error('Scene container is not initialized');
    }
    const world = await bootHubWorld(sceneContainer);
    window.dispatchEvent(
      new CustomEvent('experience-mode-changed', {
        detail: { mode: 'menu' satisfies ExperienceMode },
      }),
    );
    if (reenterXr && world.xrEnabled) {
      world.launchXR();
    }
    return world;
  });
  switchChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * In-session return to the main menu without tearing down the active world.
 * Keeps XR + scan ECS when already in `walltones-ar` (backlog #58).
 */
export function returnToMenuInPlace(): void {
  sessionStorage.setItem(MODE_STORAGE_KEY, 'menu');
  sessionStorage.removeItem('wall-tones-awaiting-mode');
  sessionStorage.removeItem('wall-tones-setup-mode');
  // Keep wall-tones-dominant-hand so a later Start can restore handedness.
  window.dispatchEvent(
    new CustomEvent('experience-mode-changed', {
      detail: { mode: 'menu' satisfies ExperienceMode },
    }),
  );
}

export function startInitialWorld(container: HTMLElement): Promise<World> {
  if (bootPromise != null) {
    return bootPromise;
  }
  bootPromise = bootHubWorld(container);
  return bootPromise;
}
