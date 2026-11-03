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
  WALL_TONE_PADS,
} from './constants.js';
import { WallTonePad } from './wall-tone-pad-component.js';

export type PadRuntime = {
  entity: Entity;
  root: Object3D;
  touchVolume: Object3D;
  padIndex: number;
  pointerArmed: boolean;
  fingerInside: boolean;
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

  const touchVolume = new Mesh(
    new BoxGeometry(sizeM, sizeM, TOUCH_BOX_DEPTH_M),
    new MeshBasicMaterial({ visible: false }),
  );
  touchVolume.name = 'touch-volume';
  touchVolume.position.z = TOUCH_BOX_DEPTH_M * 0.5;
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
    pointerArmed: true,
    fingerInside: false,
  };
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
