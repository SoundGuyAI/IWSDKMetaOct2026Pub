import {
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RayInteractable,
  type Entity,
  type World,
} from '@iwsdk/core';
import {
  HEADSET_PAD_SIZE_M,
  TOUCH_HOVER_DEPTH_M,
  TOUCH_HOVER_SCALE,
  TOUCH_PRESS_DEPTH_M,
  TOUCH_PRESS_SCALE,
} from './constants.js';
import type { WallPadCandidate, WallSlot } from './plane-placement.js';
import { WallSlotCandidate } from './wall-slot-candidate-component.js';

export const ROOM_WALL_TINT = 0x4fc3f7;
export const ROOM_MESH_TINT = 0xffb74d;
export const ROOM_CANDIDATE_COLOR = 0x81c784;
export const ROOM_CANDIDATE_HOVER = 0xfff176;
export const ROOM_CANDIDATE_SELECTED = 0x66bb6a;

export type SlotCandidateRuntime = {
  entity: Entity;
  root: Object3D;
  face: Mesh;
  material: MeshBasicMaterial;
  candidateIndex: number;
  wallIndex: number;
  transform: WallPadCandidate;
  selected: boolean;
  sizeM: number;
  /** Invisible press box (same two-collider scheme as pad buttons). */
  touchVolume: Mesh;
  /** Invisible proximity box for the pre-touch highlight. */
  hoverVolume: Mesh;
};

function makeSlotVolumeMesh(
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

type SavedMaterial = {
  mesh: Mesh;
  original: Mesh['material'];
  tint: MeshBasicMaterial;
};

const savedMaterials: SavedMaterial[] = [];

function replaceWithTint(
  root: Object3D | null | undefined,
  colorHex: number,
  opacity: number,
): void {
  if (root == null) {
    return;
  }
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const tint = new MeshBasicMaterial({
      color: new Color(colorHex),
      transparent: true,
      opacity,
      side: DoubleSide,
      depthWrite: false,
    });
    savedMaterials.push({
      mesh: child,
      original: child.material,
      tint,
    });
    child.material = tint;
    child.visible = true;
  });
}

/** Tint detected walls cyan and other scene meshes amber for room-scale debug. */
export function applyRoomSetupTints(
  wallEntities: Iterable<Entity>,
  meshEntities: Iterable<Entity>,
): void {
  clearRoomSetupTints();
  const wallSet = new Set(wallEntities);
  for (const entity of wallEntities) {
    replaceWithTint(entity.object3D, ROOM_WALL_TINT, 0.35);
  }
  for (const entity of meshEntities) {
    if (wallSet.has(entity)) {
      continue;
    }
    replaceWithTint(entity.object3D, ROOM_MESH_TINT, 0.28);
  }
}

export function clearRoomSetupTints(): void {
  for (const saved of savedMaterials) {
    saved.mesh.material = saved.original;
    saved.tint.dispose();
  }
  savedMaterials.length = 0;
}

export function createSlotCandidateRuntime(
  world: World,
  candidate: WallPadCandidate,
  sizeM = HEADSET_PAD_SIZE_M,
): SlotCandidateRuntime {
  const root = new Object3D();
  root.name = `wall-slot-candidate-${candidate.candidateIndex}`;
  const material = new MeshBasicMaterial({
    color: new Color(ROOM_CANDIDATE_COLOR),
    transparent: true,
    opacity: 0.42,
    side: DoubleSide,
    depthWrite: false,
  });
  const face = new Mesh(new BoxGeometry(sizeM, sizeM, 0.04), material);
  face.name = 'candidate-face';
  face.renderOrder = 20;
  root.add(face);
  // Two-collider touch scheme, mirroring the pad buttons: a wide hover box
  // highlights the slot when the hand gets close, a shallow press box in
  // front of the face selects it on touch. Ray/pinch stays available.
  const hoverVolume = makeSlotVolumeMesh(
    'slot-hover-volume',
    sizeM * TOUCH_HOVER_SCALE,
    sizeM * TOUCH_HOVER_SCALE,
    TOUCH_HOVER_DEPTH_M,
    TOUCH_HOVER_DEPTH_M * 0.42,
  );
  const touchVolume = makeSlotVolumeMesh(
    'slot-touch-volume',
    sizeM * TOUCH_PRESS_SCALE,
    sizeM * TOUCH_PRESS_SCALE,
    TOUCH_PRESS_DEPTH_M,
    TOUCH_PRESS_DEPTH_M * 0.42,
  );
  root.add(hoverVolume);
  root.add(touchVolume);
  root.position.set(...candidate.position);
  root.quaternion.set(...candidate.quaternion);

  const entity = world.createTransformEntity(root);
  entity.addComponent(WallSlotCandidate);
  entity.setValue(WallSlotCandidate, 'candidateIndex', candidate.candidateIndex);
  entity.setValue(WallSlotCandidate, 'wallIndex', candidate.wallIndex);
  entity.setValue(WallSlotCandidate, 'selected', false);
  entity.addComponent(RayInteractable);

  return {
    entity,
    root,
    face,
    material,
    candidateIndex: candidate.candidateIndex,
    wallIndex: candidate.wallIndex,
    transform: candidate,
    selected: false,
    sizeM,
    touchVolume,
    hoverVolume,
  };
}

export function setCandidateVisualState(
  slot: SlotCandidateRuntime,
  state: 'idle' | 'hovered' | 'selected',
): void {
  if (state === 'selected') {
    slot.selected = true;
    slot.material.color.setHex(ROOM_CANDIDATE_SELECTED);
    slot.material.opacity = 0.78;
    slot.entity.setValue(WallSlotCandidate, 'selected', true);
    return;
  }
  if (slot.selected) {
    slot.material.color.setHex(ROOM_CANDIDATE_SELECTED);
    slot.material.opacity = 0.78;
    return;
  }
  if (state === 'hovered') {
    slot.material.color.setHex(ROOM_CANDIDATE_HOVER);
    slot.material.opacity = 0.7;
    return;
  }
  slot.material.color.setHex(ROOM_CANDIDATE_COLOR);
  slot.material.opacity = 0.42;
}

export function disposeSlotCandidates(slots: SlotCandidateRuntime[]): void {
  for (const slot of slots) {
    slot.entity.dispose({ disposeResources: true });
  }
  slots.length = 0;
}

/** Optional translucent plane overlays matching wall extents (when mesh tint is faint). */
export function createWallOverlay(
  world: World,
  wall: WallSlot,
): Entity {
  const root = new Object3D();
  root.name = 'wall-overlay';
  const width = Math.max(0.2, wall.widthM);
  const height = Math.max(0.2, wall.heightM);
  const material = new MeshBasicMaterial({
    color: new Color(ROOM_WALL_TINT),
    transparent: true,
    opacity: 0.22,
    side: DoubleSide,
    depthWrite: false,
  });
  // IWSDK plane meshes lie in local XZ; local +Y is the surface normal.
  // Put wall height along local Z so the overlay lies in the wall plane.
  const mesh = new Mesh(new BoxGeometry(width, 0.02, height), material);
  mesh.renderOrder = 15;
  root.add(mesh);
  const object3D = wall.entity.object3D;
  if (object3D != null) {
    object3D.updateWorldMatrix(true, false);
    object3D.getWorldPosition(root.position);
    object3D.getWorldQuaternion(root.quaternion);
  } else {
    root.position.set(wall.center.x, wall.center.y, wall.center.z);
  }
  // Offset slightly toward the player so overlays sit in front of the wall.
  root.position.x += wall.normal.x * 0.015;
  root.position.y += wall.normal.y * 0.015;
  root.position.z += wall.normal.z * 0.015;
  return world.createTransformEntity(root);
}
