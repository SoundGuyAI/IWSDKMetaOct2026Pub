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
  TOUCH_BOX_DEPTH_M,
  TOUCH_SLOP_SCALE,
  WALL_TONE_PADS,
} from './constants.js';
import { WallTonePad } from './wall-tone-pad-component.js';

export type PadRuntime = {
  entity: Entity;
  root: Object3D;
  touchVolume: Object3D;
  padIndex: number;
  sizeM: number;
  pointerArmed: boolean;
  fingerInside: boolean;
  isGhost: boolean;
};

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

  const touchDepth = TOUCH_BOX_DEPTH_M;
  const touchVolume = new Mesh(
    new BoxGeometry(sizeM * TOUCH_SLOP_SCALE, sizeM * TOUCH_SLOP_SCALE, touchDepth),
    new MeshBasicMaterial({ visible: false }),
  );
  touchVolume.name = 'touch-volume';
  touchVolume.position.z = touchDepth * 0.45;
  root.add(touchVolume);

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
    touchVolume,
    padIndex,
    sizeM: sizeM,
    pointerArmed: true,
    fingerInside: false,
    isGhost: false,
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

  const touchVolume = new Mesh(
    new BoxGeometry(sizeM * TOUCH_SLOP_SCALE, sizeM * TOUCH_SLOP_SCALE, TOUCH_BOX_DEPTH_M),
    new MeshBasicMaterial({ visible: false }),
  );
  touchVolume.name = 'touch-volume';
  touchVolume.position.z = TOUCH_BOX_DEPTH_M * 0.45;
  root.add(touchVolume);

  const entity = world.createTransformEntity(root);
  entity.addComponent(WallTonePad);
  entity.setValue(WallTonePad, 'padIndex', padIndex);

  return {
    entity,
    root,
    touchVolume,
    padIndex,
    sizeM: sizeM,
    pointerArmed: true,
    fingerInside: false,
    isGhost: true,
  };
}

/** Turn a placement ghost into a solid playable pad in place. */
export function solidifyGhostPad(pad: PadRuntime, sizeM: number): void {
  if (!pad.isGhost) {
    return;
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
    }
  }
  const touch = pad.root.getObjectByName('touch-volume') as Mesh | undefined;
  if (touch != null) {
    touch.geometry.dispose();
    touch.geometry = new BoxGeometry(
      sizeM * TOUCH_SLOP_SCALE,
      sizeM * TOUCH_SLOP_SCALE,
      TOUCH_BOX_DEPTH_M,
    );
    touch.position.z = TOUCH_BOX_DEPTH_M * 0.45;
  }
  pad.root.name = `wall-tone-pad-${spec?.name ?? pad.padIndex}`;
  pad.isGhost = false;
}

export function disposePadRuntimes(pads: PadRuntime[]): void {
  for (const pad of pads) {
    pad.entity.dispose({ disposeResources: true });
  }
  pads.length = 0;
}

export function flashPad(pad: PadRuntime, active: boolean): void {
  const face = pad.root.getObjectByName('face') as Mesh | undefined;
  const material = face?.material;
  if (!(material instanceof MeshBasicMaterial)) {
    return;
  }
  const spec = WALL_TONE_PADS[pad.padIndex];
  material.color.setHex(spec?.color ?? 0xffffff);
  if (active) {
    material.color.offsetHSL(0, 0, 0.25);
  }
}

export function defaultDesktopPadSize(): number {
  return DESKTOP_PAD_SIZE_M;
}

export function defaultHeadsetPadSize(): number {
  return HEADSET_PAD_SIZE_M;
}
