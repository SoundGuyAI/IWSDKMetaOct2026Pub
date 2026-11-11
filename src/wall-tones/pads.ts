import {
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RayInteractable,
  XRAnchor,
  type Entity,
  type World,
} from '@iwsdk/core';
import {
  DESKTOP_PAD_SIZE_M,
  HEADSET_PAD_SIZE_M,
  TOUCH_HOVER_DEPTH_M,
  TOUCH_HOVER_SCALE,
  TOUCH_PRESS_DEPTH_M,
  TOUCH_PRESS_SCALE,
  RAY_TARGET_DEPTH_M,
  RAY_TARGET_SCALE,
  WALL_TONE_PADS,
} from './constants.js';
import { WallTonePad } from './wall-tone-pad-component.js';
import {
  createPadGlow,
  setPadGlowScale,
  syncPadGlow,
  type PadGlow,
} from './pad-glow.js';

/**
 * Minimum sRGB distance (0-1 per channel) between a pad's idle and hover
 * colors. Green, red and yellow already clear it with the standard hover
 * offset; blue (0.245) did not, so its hover looked almost like idle.
 */
const HOVER_MIN_SHIFT = 0.25;
const HOVER_WHITE = new Color(0xffffff);

function colorDistance(a: Color, b: Color): number {
  // Compare in sRGB (what the eye sees), not the renderer's linear values.
  const ha = a.getHex();
  const hb = b.getHex();
  return (
    Math.hypot(
      ((ha >> 16) & 255) - ((hb >> 16) & 255),
      ((ha >> 8) & 255) - ((hb >> 8) & 255),
      (ha & 255) - (hb & 255),
    ) / 255
  );
}

export type PadVisualState = 'idle' | 'hover' | 'pressed';

export type PadRuntime = {
  entity: Entity;
  root: Object3D;
  /** Inner press volume (legacy name kept for call sites). */
  touchVolume: Object3D;
  /** Halo + textured face (real pads only, not the placement ghosts). */
  glow?: PadGlow;
  hoverVolume: Object3D;
  debugHoverMesh: Mesh;
  debugPressMesh: Mesh;
  padIndex: number;
  sizeM: number;
  pointerArmed: boolean;
  /** Tip currently inside the inner press volume. */
  fingerInside: boolean;
  /** Tip currently inside the outer hover volume. */
  hoverInside: boolean;
  /** Earliest time (performance.now()/1000) another press may fire. */
  pressCooldownUntil: number;
  visualState: PadVisualState;
  isGhost: boolean;
};

function makeVolumeMesh(
  name: string,
  width: number,
  height: number,
  depth: number,
  z: number,
): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial({ visible: false }),
  );
  mesh.name = name;
  mesh.position.z = z;
  return mesh;
}

function makeDebugMesh(
  name: string,
  width: number,
  height: number,
  depth: number,
  z: number,
  color: number,
): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.name = name;
  mesh.position.z = z;
  mesh.renderOrder = 40;
  mesh.visible = false;
  return mesh;
}

function attachTouchVolumes(root: Object3D, sizeM: number): {
  touchVolume: Mesh;
  hoverVolume: Mesh;
  debugHoverMesh: Mesh;
  debugPressMesh: Mesh;
  rayTarget: Mesh;
} {
  const pressW = sizeM * TOUCH_PRESS_SCALE;
  const hoverW = sizeM * TOUCH_HOVER_SCALE;
  const pressZ = TOUCH_PRESS_DEPTH_M * 0.42;
  const hoverZ = TOUCH_HOVER_DEPTH_M * 0.42;

  const touchVolume = makeVolumeMesh(
    'touch-volume',
    pressW,
    pressW,
    TOUCH_PRESS_DEPTH_M,
    pressZ,
  );
  const hoverVolume = makeVolumeMesh(
    'hover-volume',
    hoverW,
    hoverW,
    TOUCH_HOVER_DEPTH_M,
    hoverZ,
  );
  const debugPressMesh = makeDebugMesh(
    'debug-press-volume',
    pressW,
    pressW,
    TOUCH_PRESS_DEPTH_M,
    pressZ,
    0xff66cc,
  );
  const debugHoverMesh = makeDebugMesh(
    'debug-hover-volume',
    hoverW,
    hoverW,
    TOUCH_HOVER_DEPTH_M,
    hoverZ,
    0x66fff0,
  );

  // The fingertip volumes are hand-only colliders. They must never answer
  // pointer raycasts, or the controller/hand ray (and desktop pointer) would
  // hit a huge invisible box around the pad (owner feedback 2026-11-11).
  // Rays instead hit the pad face or the slightly-larger ray target below.
  const noRaycast = () => {};
  touchVolume.raycast = noRaycast;
  hoverVolume.raycast = noRaycast;
  debugPressMesh.raycast = noRaycast;
  debugHoverMesh.raycast = noRaycast;

  const rayTarget = makeVolumeMesh(
    'ray-target',
    sizeM * RAY_TARGET_SCALE,
    sizeM * RAY_TARGET_SCALE,
    RAY_TARGET_DEPTH_M,
    RAY_TARGET_DEPTH_M * 0.5,
  );

  root.add(hoverVolume);
  root.add(touchVolume);
  root.add(debugHoverMesh);
  root.add(debugPressMesh);
  root.add(rayTarget);

  return { touchVolume, hoverVolume, debugHoverMesh, debugPressMesh, rayTarget };
}

function basePadFields(
  padIndex: number,
  sizeM: number,
  volumes: ReturnType<typeof attachTouchVolumes>,
  isGhost: boolean,
): Omit<PadRuntime, 'entity' | 'root'> {
  return {
    touchVolume: volumes.touchVolume,
    hoverVolume: volumes.hoverVolume,
    debugHoverMesh: volumes.debugHoverMesh,
    debugPressMesh: volumes.debugPressMesh,
    padIndex,
    sizeM,
    pointerArmed: true,
    fingerInside: false,
    hoverInside: false,
    pressCooldownUntil: 0,
    visualState: 'idle',
    isGhost,
  };
}

export function createPadRuntime(
  world: World,
  padIndex: number,
  sizeM: number,
  options: { rayInteractable: boolean; anchor: boolean },
): PadRuntime {
  const spec = WALL_TONE_PADS[padIndex];
  if (spec == null) {
    throw new Error(`Invalid pad index ${padIndex}`);
  }

  const root = new Object3D();
  root.name = `wall-tone-pad-${spec.name}`;

  const faceMaterial = new MeshBasicMaterial({
    color: new Color(spec.color),
    side: DoubleSide,
  });
  const face = new Mesh(new BoxGeometry(sizeM, sizeM, 0.02), faceMaterial);
  face.name = 'face';
  face.renderOrder = 10;
  root.add(face);
  const glow = createPadGlow(face, faceMaterial, sizeM, padIndex);

  const volumes = attachTouchVolumes(root, sizeM);
  const entity = world.createTransformEntity(root);
  entity.addComponent(WallTonePad);
  entity.setValue(WallTonePad, 'padIndex', padIndex);
  if (options.rayInteractable) {
    entity.addComponent(RayInteractable);
  }
  if (options.anchor) {
    entity.addComponent(XRAnchor);
  }

  return {
    entity,
    root,
    glow,
    ...basePadFields(padIndex, sizeM, volumes, false),
  };
}

/** Hollow frame + translucent fill so placement ghosts read as a silhouette, not a solid pad. */
export function createGhostPadRuntime(
  world: World,
  padIndex: number,
  sizeM: number,
): PadRuntime {
  const spec = WALL_TONE_PADS[padIndex];
  if (spec == null) {
    throw new Error(`Invalid pad index ${padIndex}`);
  }

  const root = new Object3D();
  root.name = `wall-tone-ghost-${spec.name}`;

  const color = new Color(spec.color);
  const fill = new Mesh(
    new BoxGeometry(sizeM * 0.92, sizeM * 0.92, 0.012),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  fill.name = 'face';
  fill.renderOrder = 11;
  root.add(fill);

  const frameThickness = Math.max(0.018, sizeM * 0.06);
  const frameDepth = 0.028;
  const frameMat = new MeshBasicMaterial({
    color: color.clone().offsetHSL(0, 0, 0.18),
    transparent: true,
    opacity: 0.92,
    side: DoubleSide,
  });
  const half = sizeM * 0.5;
  const long = sizeM;
  const edges: Array<[number, number, number, number, number]> = [
    [0, half - frameThickness * 0.5, 0, long, frameThickness],
    [0, -half + frameThickness * 0.5, 0, long, frameThickness],
    [-half + frameThickness * 0.5, 0, 0, frameThickness, long - frameThickness * 2],
    [half - frameThickness * 0.5, 0, 0, frameThickness, long - frameThickness * 2],
  ];
  for (const [x, y, z, w, h] of edges) {
    const edge = new Mesh(new BoxGeometry(w, h, frameDepth), frameMat);
    edge.name = 'ghost-frame';
    edge.position.set(x, y, z);
    edge.renderOrder = 12;
    root.add(edge);
  }

  const corner = Math.max(0.04, sizeM * 0.12);
  for (const [sx, sy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    const marker = new Mesh(
      new BoxGeometry(corner, corner, frameDepth * 1.2),
      frameMat,
    );
    marker.name = 'ghost-corner';
    marker.position.set(
      sx * (half - corner * 0.5),
      sy * (half - corner * 0.5),
      0.01,
    );
    marker.renderOrder = 13;
    root.add(marker);
  }

  const volumes = attachTouchVolumes(root, sizeM);
  const entity = world.createTransformEntity(root);
  entity.addComponent(WallTonePad);
  entity.setValue(WallTonePad, 'padIndex', padIndex);

  return {
    entity,
    root,
    ...basePadFields(padIndex, sizeM, volumes, true),
  };
}

/** Turn a placement ghost into a solid playable pad in place. */
export function solidifyGhostPad(pad: PadRuntime, sizeM: number): void {
  if (!pad.isGhost) {
    return;
  }
  // Play pads must answer controller/hand rays like the flat grid ones
  // (createPadRuntime adds this for them); ghosts skip it while placing.
  if (!pad.entity.hasComponent(RayInteractable)) {
    pad.entity.addComponent(RayInteractable);
  }
  pad.sizeM = sizeM;
  const toRemove: Object3D[] = [];
  pad.root.traverse((child) => {
    if (child.name === 'ghost-frame' || child.name === 'ghost-corner') {
      toRemove.push(child);
    }
  });
  const disposedMaterials = new Set<object>();
  for (const child of toRemove) {
    child.removeFromParent();
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (!Array.isArray(material) && !disposedMaterials.has(material)) {
        disposedMaterials.add(material);
        material.dispose();
      }
    }
  }

  const face = pad.root.getObjectByName('face') as Mesh | undefined;
  const spec = WALL_TONE_PADS[pad.padIndex];
  if (face != null) {
    face.geometry.dispose();
    face.geometry = new BoxGeometry(sizeM, sizeM, 0.02);
    const material = face.material;
    if (material instanceof MeshBasicMaterial) {
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.color.setHex(spec?.color ?? 0xffffff);
      pad.glow = createPadGlow(face, material, sizeM, pad.padIndex);
    }
  }
  resizeTouchVolumes(pad, sizeM);
  pad.root.name = `wall-tone-pad-${spec?.name ?? pad.padIndex}`;
  pad.isGhost = false;
  pad.visualState = 'idle';
  applyPadVisualState(pad, 'idle');
}

function resizeTouchVolumes(pad: PadRuntime, sizeM: number): void {
  const pressW = sizeM * TOUCH_PRESS_SCALE;
  const hoverW = sizeM * TOUCH_HOVER_SCALE;
  const pressZ = TOUCH_PRESS_DEPTH_M * 0.42;
  const hoverZ = TOUCH_HOVER_DEPTH_M * 0.42;

  for (const [mesh, w, d, z] of [
    [pad.touchVolume, pressW, TOUCH_PRESS_DEPTH_M, pressZ],
    [pad.hoverVolume, hoverW, TOUCH_HOVER_DEPTH_M, hoverZ],
    [pad.debugPressMesh, pressW, TOUCH_PRESS_DEPTH_M, pressZ],
    [pad.debugHoverMesh, hoverW, TOUCH_HOVER_DEPTH_M, hoverZ],
  ] as const) {
    if (!(mesh instanceof Mesh)) {
      continue;
    }
    mesh.geometry.dispose();
    mesh.geometry = new BoxGeometry(w, w, d);
    mesh.position.z = z;
  }
}

export function setPadDebugCollidersVisible(
  pad: PadRuntime,
  visible: boolean,
): void {
  pad.debugHoverMesh.visible = visible;
  pad.debugPressMesh.visible = visible;
}

export function applyPadVisualState(
  pad: PadRuntime,
  state: PadVisualState,
): void {
  pad.visualState = state;
  const face = pad.root.getObjectByName('face') as Mesh | undefined;
  const material = face?.material;
  if (!(material instanceof MeshBasicMaterial)) {
    return;
  }
  const spec = WALL_TONE_PADS[pad.padIndex];
  material.color.setHex(spec?.color ?? 0xffffff);
  if (face != null) {
    setPadGlowScale(pad.glow, face, 1, 1);
  }
  if (state === 'hover') {
    // Entering the wide proximity box: richer sat, slightly brighter.
    const idle = material.color.clone();
    material.color.offsetHSL(0.02, 0.22, 0.12);
    // Blue is already bright and saturated, so the fixed offset barely moves
    // it. Push any pad whose hover shift is below the other pads' toward white
    // until the shift matches them, so every pad's hover reads equally.
    for (
      let i = 0;
      i < 15 && colorDistance(idle, material.color) < HOVER_MIN_SHIFT;
      i += 1
    ) {
      material.color.lerp(HOVER_WHITE, 0.04);
    }
  } else if (state === 'pressed') {
    // Confirmed press: punchier lightness / sat shift.
    material.color.offsetHSL(-0.03, 0.15, 0.32);
  }
  syncPadGlow(pad.glow, material, state);
}

export function disposePadRuntimes(pads: PadRuntime[]): void {
  for (const pad of pads) {
    pad.entity.dispose({ disposeResources: true });
  }
  pads.length = 0;
}

/**
 * Blink for fanfare / pattern playback. Keeps the cube's own hue: fully
 * saturated and a bit lighter than idle (never pulled toward white), and the
 * face grows slightly so the flash still reads in MR.
 */
export function flashPad(pad: PadRuntime, active: boolean): void {
  const face = pad.root.getObjectByName('face') as Mesh | undefined;
  const material = face?.material;
  if (!(material instanceof MeshBasicMaterial)) {
    return;
  }
  const spec = WALL_TONE_PADS[pad.padIndex];
  if (active) {
    pad.visualState = 'pressed';
    material.color.setHex(spec?.color ?? 0xffffff);
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);
    material.color.setHSL(hsl.h, 1, Math.min(0.62, hsl.l + 0.1));
    setPadGlowScale(pad.glow, face, 1.14, 1.35);
    syncPadGlow(pad.glow, material, 'pressed');
    return;
  }
  setPadGlowScale(pad.glow, face, 1, 1);
  applyPadVisualState(pad, pad.hoverInside ? 'hover' : 'idle');
}

export function defaultDesktopPadSize(): number {
  return DESKTOP_PAD_SIZE_M;
}

export function defaultHeadsetPadSize(): number {
  return HEADSET_PAD_SIZE_M;
    }
