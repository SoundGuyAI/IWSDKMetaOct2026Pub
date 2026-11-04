import {
  SessionMode,
  World,
  type WorldOptions,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AppModeSystem, type ExperienceMode } from '../app-mode.js';
import { GuidedSensingSystem } from '../guided-sensing.js';
import { PanelSystem } from '../panel.js';
import { RobotSystem } from '../robot.js';
import { WallTonesSystem } from './wall-tones-system.js';

const MODE_STORAGE_KEY = 'iwsdk-experience-mode';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export type ActiveWorldKind = 'hub-vr' | 'walltones-ar';

let sceneContainer: HTMLElement | null = null;
let activeWorld: World | null = null;
let activeKind: ActiveWorldKind = 'hub-vr';
let bootPromise: Promise<World> | null = null;

function registerHubSystems(world: World): void {
  world.registerSystem(AppModeSystem);
  world.registerSystem(GuidedSensingSystem);
  world.registerSystem(RobotSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(WallTonesSystem);
}

function registerArSystems(world: World): void {
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
      features: {
        handTracking: true,
        planeDetection: true,
        anchors: true,
        hitTest: true,
      },
    },
    features: {
      ...(projectOptions.features ?? {}),
      locomotion: false,
      grabbing: false,
      physics: false,
      sceneUnderstanding: true,
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
  activeWorld.exitXR();
  activeWorld.destroy();
  activeWorld = null;
}

export async function bootHubWorld(container: HTMLElement): Promise<World> {
  sceneContainer = container;
  await destroyActiveWorld();
  const world = await World.create(container, projectOptions);
  registerHubSystems(world);
  activeWorld = world;
  activeKind = 'hub-vr';
  return world;
}

export async function switchToWallTonesArWorld(): Promise<World> {
  if (sceneContainer == null) {
    throw new Error('Scene container is not initialized');
  }
  sessionStorage.setItem(MODE_STORAGE_KEY, 'walltones');
  await destroyActiveWorld();
  const world = await World.create(sceneContainer, buildArWorldOptions());
  registerArSystems(world);
  activeWorld = world;
  activeKind = 'walltones-ar';
  world.launchXR();
  return world;
}

export async function switchBackToHubMenu(): Promise<World> {
  sessionStorage.setItem(MODE_STORAGE_KEY, 'menu');
  window.dispatchEvent(
    new CustomEvent('experience-mode-changed', {
      detail: { mode: 'menu' satisfies ExperienceMode },
    }),
  );
  if (sceneContainer == null) {
    throw new Error('Scene container is not initialized');
  }
  return bootHubWorld(sceneContainer);
}

export function startInitialWorld(container: HTMLElement): Promise<World> {
  if (bootPromise != null) {
    return bootPromise;
  }
  bootPromise = bootHubWorld(container);
  return bootPromise;
}
