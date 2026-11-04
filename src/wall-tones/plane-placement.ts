import type { Entity } from '@iwsdk/core';
import { XRPlane } from '@iwsdk/core';
import {
  DESKTOP_GRID_DISTANCE_M,
  DESKTOP_GRID_LATERAL_M,
  DESKTOP_PAD_GAP_M,
  HEADSET_PAD_SIZE_M,
  PAD_GAP_M,
} from './constants.js';

type XRPlaneData = {
  orientation?: string;
  polygon?: DOMPointReadOnly[];
};

export type PlacedPadTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

type WallSlot = {
  entity: Entity;
  plane: XRPlaneData;
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
};

function readPlane(entity: Entity): XRPlaneData | null {
  const plane = entity.getValue(XRPlane, '_plane') as XRPlaneData | undefined;
  return plane ?? null;
}

function polygonCenter(polygon: DOMPointReadOnly[] | undefined): {
  x: number;
  y: number;
  z: number;
} | null {
  if (polygon == null || polygon.length === 0) {
    return null;
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of polygon) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const count = polygon.length;
  return { x: x / count, y: y / count, z: z / count };
}

function estimateWallNormal(
  plane: XRPlaneData,
  viewer: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const nx = viewer.x - center.x;
  const ny = viewer.y - center.y;
  const nz = viewer.z - center.z;
  const length = Math.hypot(nx, ny, nz) || 1;
  if (plane.orientation === 'vertical') {
    return { x: nx / length, y: 0, z: nz / length };
  }
  return { x: 0, y: 1, z: 0 };
}

function orientPadTowardPlayer(
  normal: { x: number; y: number; z: number },
): [number, number, number, number] {
  const yaw = Math.atan2(normal.x, normal.z);
  const half = yaw * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

export function collectVerticalWalls(
  planeEntities: Iterable<Entity>,
  viewer: { x: number; y: number; z: number },
): WallSlot[] {
  const walls: WallSlot[] = [];
  for (const entity of planeEntities) {
    const plane = readPlane(entity);
    if (plane?.orientation !== 'vertical') {
      continue;
    }
    const center = polygonCenter(plane.polygon);
    if (center == null) {
      continue;
    }
    const dy = Math.abs(center.y - viewer.y);
    if (dy > 1.2) {
      continue;
    }
    walls.push({
      entity,
      plane,
      center,
      normal: estimateWallNormal(plane, viewer, center),
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
    if (plane?.orientation !== 'horizontal') {
      continue;
    }
    const center = polygonCenter(plane.polygon);
    if (center == null) {
      continue;
    }
    if (center.y < floorY + 0.55 || center.y > floorY + 1.2) {
      continue;
    }
    const span = plane.polygon?.length ?? 0;
    if (span < 4) {
      continue;
    }
    tables.push({
      entity,
      plane,
      center,
      normal: { x: 0, y: 1, z: 0 },
    });
  }
  tables.sort((a, b) => b.center.y - a.center.y);
  return tables;
}

/** Returns four pad transforms or null when nothing valid fits. */
export function planRoomScalePads(
  walls: WallSlot[],
  viewerY: number,
): PlacedPadTransform[] | null {
  if (walls.length === 0) {
    return null;
  }
  const size = HEADSET_PAD_SIZE_M;
  const step = size + PAD_GAP_M;
  const placements: PlacedPadTransform[] = [];
  const usedWalls: WallSlot[] = [];

  for (const wall of walls) {
    if (placements.length >= 4) {
      break;
    }
    if (!usedWalls.includes(wall)) {
      usedWalls.push(wall);
      const baseY = Math.min(viewerY + 0.05, wall.center.y + 0.35);
      const alongX = (placements.length % 2) * step - step * 0.5;
      const alongY = Math.floor(placements.length / 2) * step;
      placements.push({
        position: [
          wall.center.x + alongX * wall.normal.z,
          baseY + alongY * 0.15,
          wall.center.z + alongX * wall.normal.x,
        ],
        quaternion: orientPadTowardPlayer(wall.normal),
      });
    }
  }

  let wallIndex = 0;
  while (placements.length < 4 && walls.length > 0) {
    const wall = walls[wallIndex % walls.length]!;
    const indexOnWall = placements.filter((_, i) => i >= usedWalls.length).length;
    const offset = (indexOnWall + 1) * step;
    placements.push({
      position: [
        wall.center.x + wall.normal.x * 0.02,
        Math.min(viewerY + 0.1, wall.center.y + 0.4) + offset * 0.05,
        wall.center.z + wall.normal.z * 0.02,
      ],
      quaternion: orientPadTowardPlayer(wall.normal),
    });
    wallIndex += 1;
    if (placements.length > 6) {
      return null;
    }
  }

  return placements.length === 4 ? placements : null;
}

export function planTablePads(table: WallSlot): PlacedPadTransform[] {
  const size = HEADSET_PAD_SIZE_M;
  const step = size + PAD_GAP_M;
  const cx = table.center.x;
  const cy = table.center.y + 0.01;
  const cz = table.center.z;
  const offsets = [
    [-step * 0.5, -step * 0.5],
    [step * 0.5, -step * 0.5],
    [-step * 0.5, step * 0.5],
    [step * 0.5, step * 0.5],
  ];
  return offsets.map(([ox, oz]) => ({
    position: [cx + ox, cy, cz + oz],
    quaternion: orientPadTowardPlayer(table.normal),
  }));
}

/** Flat browser layout: 2×2 grid centered in the camera view (not player origin). */
export function planDesktopGridFromCamera(
  cameraPosition: { x: number; y: number; z: number },
  cameraForward: { x: number; y: number; z: number },
  size: number,
): PlacedPadTransform[] {
  const step = size + DESKTOP_PAD_GAP_M;
  const fx = cameraForward.x;
  const fy = cameraForward.y;
  const fz = cameraForward.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const forwardX = fx / fl;
  const forwardY = fy / fl;
  const forwardZ = fz / fl;

  let rightX = -forwardZ;
  let rightZ = forwardX;
  const rightLen = Math.hypot(rightX, rightZ) || 1;
  rightX /= rightLen;
  rightZ /= rightLen;

  const centerX =
    cameraPosition.x +
    forwardX * DESKTOP_GRID_DISTANCE_M +
    rightX * DESKTOP_GRID_LATERAL_M;
  const centerY = cameraPosition.y + forwardY * DESKTOP_GRID_DISTANCE_M + 0.06;
  const centerZ =
    cameraPosition.z +
    forwardZ * DESKTOP_GRID_DISTANCE_M +
    rightZ * DESKTOP_GRID_LATERAL_M;

  const upX = forwardY * rightZ;
  const upY = forwardZ * rightX - forwardX * rightZ;
  const upZ = -forwardY * rightX;
  const upLen = Math.hypot(upX, upY, upZ) || 1;
  const upNormX = upX / upLen;
  const upNormY = upY / upLen;
  const upNormZ = upZ / upLen;

  const yaw = Math.atan2(
    cameraPosition.x - centerX,
    cameraPosition.z - centerZ,
  );
  const half = yaw * 0.5;
  const quaternion: [number, number, number, number] = [
    0,
    Math.sin(half),
    0,
    Math.cos(half),
  ];

  const rowStep = step * 0.92;
  const offsets = [
    [-step * 0.5, rowStep * 0.5],
    [step * 0.5, rowStep * 0.5],
    [-step * 0.5, -rowStep * 0.5],
    [step * 0.5, -rowStep * 0.5],
  ];

  return offsets.map(([alongRight, alongUp]) => ({
    position: [
      centerX + rightX * alongRight + upNormX * alongUp,
      centerY + upNormY * alongUp,
      centerZ + rightZ * alongRight + upNormZ * alongUp,
    ],
    quaternion,
  }));
}
