import type { Entity } from '@iwsdk/core';
import { Object3D, Quaternion, Vector3, XRPlane } from '@iwsdk/core';
import {
  AIR_PLACE_SITTING_PAD_SIZE_M,
  DESKTOP_GRID_DISTANCE_M,
  DESKTOP_GRID_LATERAL_M,
  DESKTOP_PAD_GAP_M,
  HEADSET_PAD_SIZE_M,
  PAD_GAP_M,
  PHONE_GRID_DISTANCE_M,
  PHONE_GRID_VERTICAL_M,
  PHONE_PAD_GAP_M,
} from './constants.js';

type XRPlaneData = {
  orientation?: string;
  polygon?: DOMPointReadOnly[];
};

export type PlacedPadTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

export type WallSlot = {
  entity: Entity;
  plane: XRPlaneData;
  /** World-space center of the wall plane origin / mesh. */
  center: { x: number; y: number; z: number };
  /** World-space outward normal (toward the player when possible). */
  normal: { x: number; y: number; z: number };
  /** Local-space extents of the plane polygon on X/Z (meters). */
  localMinX: number;
  localMaxX: number;
  localMinZ: number;
  localMaxZ: number;
  widthM: number;
  heightM: number;
};

export type WallPadCandidate = PlacedPadTransform & {
  wallIndex: number;
  candidateIndex: number;
};

const _worldPos = new Vector3();
const _worldNormal = new Vector3();
const _localPoint = new Vector3();
const _quat = new Quaternion();
const _tmp = new Vector3();

function readPlane(entity: Entity): XRPlaneData | null {
  const plane = entity.getValue(XRPlane, '_plane') as XRPlaneData | undefined;
  return plane ?? null;
}

function polygonExtents(polygon: DOMPointReadOnly[] | undefined): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  if (polygon == null || polygon.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }
  return { minX, maxX, minZ, maxZ };
}

function orientPadTowardPlayer(
  normal: { x: number; y: number; z: number },
): [number, number, number, number] {
  const yaw = Math.atan2(normal.x, normal.z);
  const half = yaw * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/** Face-up pad on a table (thin axis points up). */
function orientPadFlatOnTable(): [number, number, number, number] {
  // -90° around X: local XY face becomes world XZ (horizontal).
  const half = -Math.PI / 4;
  return [Math.sin(half), 0, 0, Math.cos(half)];
}

function worldNormalFromPlaneObject(
  object3D: Object3D,
  viewer: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  // IWSDK plane meshes are thin boxes in local XZ; local +Y is the plane normal.
  _worldNormal.set(0, 1, 0).transformDirection(object3D.matrixWorld).normalize();
  _tmp.set(viewer.x - center.x, viewer.y - center.y, viewer.z - center.z);
  if (_worldNormal.dot(_tmp) < 0) {
    _worldNormal.negate();
  }
  // Prefer upright walls: flatten tiny Y drift for vertical planes.
  if (Math.abs(_worldNormal.y) < 0.35) {
    _worldNormal.y = 0;
    _worldNormal.normalize();
  }
  return { x: _worldNormal.x, y: _worldNormal.y, z: _worldNormal.z };
}

/**
 * Collect vertical walls using each plane entity's world pose.
 * Polygon coords stay local; centers/normals are converted to world space.
 */
export function collectVerticalWalls(
  planeEntities: Iterable<Entity>,
  viewer: { x: number; y: number; z: number },
): WallSlot[] {
  const walls: WallSlot[] = [];
  for (const entity of planeEntities) {
    const plane = readPlane(entity);
    if (plane == null) {
      continue;
    }
    const object3D = entity.object3D;
    if (object3D == null) {
      continue;
    }
    object3D.updateWorldMatrix(true, false);
    object3D.getWorldPosition(_worldPos);

    const extents = polygonExtents(plane.polygon);
    const widthM = extents != null ? Math.max(0.01, extents.maxX - extents.minX) : 1;
    const heightM = extents != null ? Math.max(0.01, extents.maxZ - extents.minZ) : 1;

    // Orientation from WebXR when present; otherwise infer from world normal.
    object3D.getWorldQuaternion(_quat);
    _worldNormal.set(0, 1, 0).applyQuaternion(_quat).normalize();
    const isVertical =
      plane.orientation === 'vertical' || Math.abs(_worldNormal.y) < 0.45;
    if (!isVertical) {
      continue;
    }

    const center = { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z };
    // Keep walls that overlap reachable play height (not only plane origins near eye).
    const wallMinY = center.y - heightM * 0.5;
    const wallMaxY = center.y + heightM * 0.5;
    if (wallMaxY < viewer.y - 1.6 || wallMinY > viewer.y + 1.4) {
      continue;
    }
    if (widthM < HEADSET_PAD_SIZE_M * 0.85 || heightM < HEADSET_PAD_SIZE_M * 0.85) {
      continue;
    }

    walls.push({
      entity,
      plane,
      center,
      normal: worldNormalFromPlaneObject(object3D, viewer, center),
      localMinX: extents?.minX ?? -0.5,
      localMaxX: extents?.maxX ?? 0.5,
      localMinZ: extents?.minZ ?? -0.5,
      localMaxZ: extents?.maxZ ?? 0.5,
      widthM,
      heightM,
    });
  }
  walls.sort(
    (a, b) =>
      Math.hypot(a.center.x - viewer.x, a.center.z - viewer.z) -
      Math.hypot(b.center.x - viewer.x, b.center.z - viewer.z),
  );
  return walls;
}

export function collectTablePlanes(
  planeEntities: Iterable<Entity>,
  floorY: number,
): WallSlot[] {
  const tables: WallSlot[] = [];
  for (const entity of planeEntities) {
    const plane = readPlane(entity);
    if (plane == null) {
      continue;
    }
    const object3D = entity.object3D;
    if (object3D == null) {
      continue;
    }
    object3D.updateWorldMatrix(true, false);
    object3D.getWorldPosition(_worldPos);
    object3D.getWorldQuaternion(_quat);
    _worldNormal.set(0, 1, 0).applyQuaternion(_quat).normalize();
    const isHorizontal =
      plane.orientation === 'horizontal' || Math.abs(_worldNormal.y) > 0.7;
    if (!isHorizontal) {
      continue;
    }
    if (_worldPos.y < floorY + 0.45 || _worldPos.y > floorY + 1.35) {
      continue;
    }
    const extents = polygonExtents(plane.polygon);
    const widthM = extents != null ? extents.maxX - extents.minX : 0;
    const depthM = extents != null ? extents.maxZ - extents.minZ : 0;
    if (widthM < 0.4 || depthM < 0.4) {
      continue;
    }
    tables.push({
      entity,
      plane,
      center: { x: _worldPos.x, y: _worldPos.y, z: _worldPos.z },
      normal: { x: 0, y: 1, z: 0 },
      localMinX: extents?.minX ?? -0.5,
      localMaxX: extents?.maxX ?? 0.5,
      localMinZ: extents?.minZ ?? -0.5,
      localMaxZ: extents?.maxZ ?? 0.5,
      widthM,
      heightM: depthM,
    });
  }
  tables.sort((a, b) => b.center.y - a.center.y);
  return tables;
}

/** Grid of 1x1m candidates on one wall that fit inside the plane polygon. */
export function generateWallPadCandidates(
  walls: WallSlot[],
  viewerY: number,
  sizeM = HEADSET_PAD_SIZE_M,
): WallPadCandidate[] {
  const candidates: WallPadCandidate[] = [];
  let candidateIndex = 0;
  const half = sizeM * 0.5;
  const step = sizeM + 0.12;

  walls.forEach((wall, wallIndex) => {
    const object3D = wall.entity.object3D;
    if (object3D == null) {
      return;
    }
    object3D.updateWorldMatrix(true, false);

    const minX = wall.localMinX + half + 0.05;
    const maxX = wall.localMaxX - half - 0.05;
    const minZ = wall.localMinZ + half + 0.05;
    const maxZ = wall.localMaxZ - half - 0.05;
    if (minX > maxX || minZ > maxZ) {
      return;
    }

    for (let lx = minX; lx <= maxX + 1e-4; lx += step) {
      for (let lz = minZ; lz <= maxZ + 1e-4; lz += step) {
        _localPoint.set(lx, 0.02, lz);
        object3D.localToWorld(_localPoint);
        // Prefer playable heights near eye / chest.
        if (_localPoint.y < viewerY - 0.85 || _localPoint.y > viewerY + 0.55) {
          continue;
        }
        const quat = orientPadTowardPlayer(wall.normal);
        // Nudge slightly off the wall along the normal so the pad sits in front.
        candidates.push({
          position: [
            _localPoint.x + wall.normal.x * 0.03,
            _localPoint.y + wall.normal.y * 0.03,
            _localPoint.z + wall.normal.z * 0.03,
          ],
          quaternion: quat,
          wallIndex,
          candidateIndex,
        });
        candidateIndex += 1;
      }
    }
  });

  return candidates;
}

/** Largest candidate count found on any single surface (wallIndex). */
export function maxCandidatesOnOneSurface(
  candidates: WallPadCandidate[],
): number {
  const perSurface = new Map<number, number>();
  for (const candidate of candidates) {
    perSurface.set(
      candidate.wallIndex,
      (perSurface.get(candidate.wallIndex) ?? 0) + 1,
    );
  }
  let max = 0;
  for (const count of perSurface.values()) {
    if (count > max) {
      max = count;
    }
  }
  return max;
}

/** Grid of sitting-sized candidates on horizontal table planes. */
export function generateTablePadCandidates(
  tables: WallSlot[],
  sizeM = AIR_PLACE_SITTING_PAD_SIZE_M,
): WallPadCandidate[] {
  const candidates: WallPadCandidate[] = [];
  let candidateIndex = 0;
  const half = sizeM * 0.5;
  const step = sizeM + 0.08;
  const flatQuat = orientPadFlatOnTable();

  tables.forEach((table, wallIndex) => {
    const object3D = table.entity.object3D;
    if (object3D == null) {
      return;
    }
    object3D.updateWorldMatrix(true, false);

    const minX = table.localMinX + half + 0.04;
    const maxX = table.localMaxX - half - 0.04;
    const minZ = table.localMinZ + half + 0.04;
    const maxZ = table.localMaxZ - half - 0.04;
    if (minX > maxX || minZ > maxZ) {
      return;
    }

    for (let lx = minX; lx <= maxX + 1e-4; lx += step) {
      for (let lz = minZ; lz <= maxZ + 1e-4; lz += step) {
        _localPoint.set(lx, 0.02, lz);
        object3D.localToWorld(_localPoint);
        candidates.push({
          position: [
            _localPoint.x + table.normal.x * 0.02,
            _localPoint.y + table.normal.y * 0.02,
            _localPoint.z + table.normal.z * 0.02,
          ],
          quaternion: flatQuat,
          wallIndex,
          candidateIndex,
        });
        candidateIndex += 1;
      }
    }
  });

  return candidates;
}

/** Auto plan used as a soft suggestion; prefer interactive pick when available. */
export function planRoomScalePads(
  walls: WallSlot[],
  viewerY: number,
): PlacedPadTransform[] | null {
  const candidates = generateWallPadCandidates(walls, viewerY);
  if (candidates.length < 4) {
    return null;
  }
  // Spread across walls when possible: take first hit per wall, then fill.
  const picked: WallPadCandidate[] = [];
  const usedWalls = new Set<number>();
  for (const candidate of candidates) {
    if (picked.length >= 4) {
      break;
    }
    if (!usedWalls.has(candidate.wallIndex)) {
      usedWalls.add(candidate.wallIndex);
      picked.push(candidate);
    }
  }
  for (const candidate of candidates) {
    if (picked.length >= 4) {
      break;
    }
    if (picked.some((p) => p.candidateIndex === candidate.candidateIndex)) {
      continue;
    }
    const tooClose = picked.some((p) => {
      const dx = p.position[0] - candidate.position[0];
      const dy = p.position[1] - candidate.position[1];
      const dz = p.position[2] - candidate.position[2];
      return Math.hypot(dx, dy, dz) < HEADSET_PAD_SIZE_M * 0.9;
    });
    if (!tooClose) {
      picked.push(candidate);
    }
  }
  return picked.length === 4
    ? picked.map(({ position, quaternion }) => ({ position, quaternion }))
    : null;
}

export function planTablePads(table: WallSlot): PlacedPadTransform[] {
  const size = AIR_PLACE_SITTING_PAD_SIZE_M;
  const step = size + PAD_GAP_M * 0.5;
  const cx = table.center.x;
  const cy = table.center.y + 0.02;
  const cz = table.center.z;
  const flatQuat = orientPadFlatOnTable();
  const offsets = [
    [-step * 0.5, -step * 0.5],
    [step * 0.5, -step * 0.5],
    [-step * 0.5, step * 0.5],
    [step * 0.5, step * 0.5],
  ];
  return offsets.map(([ox, oz]) => ({
    position: [cx + ox, cy, cz + oz],
    quaternion: flatQuat,
  }));
}

export type FlatPadGridLayout = {
  distanceM: number;
  lateralM: number;
  verticalM: number;
  gapM: number;
};

const DESKTOP_FLAT_GRID: FlatPadGridLayout = {
  distanceM: DESKTOP_GRID_DISTANCE_M,
  lateralM: DESKTOP_GRID_LATERAL_M,
  verticalM: 0,
  gapM: DESKTOP_PAD_GAP_M,
};

/** Phone portrait: centered 2×2 dropped into the lower half under the HUD. */
export const PHONE_FLAT_GRID: FlatPadGridLayout = {
  distanceM: PHONE_GRID_DISTANCE_M,
  lateralM: 0,
  verticalM: PHONE_GRID_VERTICAL_M,
  gapM: PHONE_PAD_GAP_M,
};

/** Flat browser layout: 2×2 grid in the camera view (not player origin). */
export function planDesktopGridFromCamera(
  cameraPosition: { x: number; y: number; z: number },
  cameraForward: { x: number; y: number; z: number },
  size: number,
  layout: FlatPadGridLayout = DESKTOP_FLAT_GRID,
): PlacedPadTransform[] {
  const step = size + layout.gapM;
  const forward = new Vector3(
    cameraForward.x,
    cameraForward.y,
    cameraForward.z,
  ).normalize();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }
  const up = new Vector3().crossVectors(right, forward).normalize();
  const center = new Vector3(
    cameraPosition.x,
    cameraPosition.y,
    cameraPosition.z,
  )
    .addScaledVector(forward, layout.distanceM)
    .addScaledVector(right, layout.lateralM)
    .addScaledVector(up, layout.verticalM);
  const yaw = Math.atan2(-forward.x, -forward.z);
  const half = yaw * 0.5;
  const quat: [number, number, number, number] = [
    0,
    Math.sin(half),
    0,
    Math.cos(half),
  ];
  const offsets = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ];
  return offsets.map(([ox, oy]) => {
    const pos = center
      .clone()
      .addScaledVector(right, ox * step)
      .addScaledVector(up, oy * step);
    return {
      position: [pos.x, pos.y, pos.z] as [number, number, number],
      quaternion: quat,
    };
  });
}
