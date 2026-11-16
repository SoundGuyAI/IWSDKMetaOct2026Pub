import { expect, test } from '@playwright/test';
import {
  TOUCH_PRESS_DEPTH_M,
  TOUCH_PRESS_SCALE,
  TOUCH_HOVER_DEPTH_M,
  TOUCH_HOVER_SCALE,
  TOUCH_PRESS_NEAR_SCALE,
  TOUCH_PRESS_FAR_SCALE,
  TOUCH_HOVER_NEAR_SCALE,
  TOUCH_HOVER_FAR_SCALE,
  TOUCH_PRESS_NEAR_Z_M,
  TOUCH_PRESS_FAR_Z_M,
  TOUCH_HOVER_NEAR_Z_M,
  TOUCH_HOVER_FAR_Z_M,
} from '../../src/wall-tones/constants.js';
import {
  makeFrustumVolumeMesh,
  pointInFrustumVolume,
  type FrustumVolumeSpec,
} from '../../src/wall-tones/pads.js';

// Backlog 82 (owner 2026-11-14 00:58): air-pad fingertip volumes are frusta,
// not cubes - small face at the pad, big face toward the player, so adjacent
// air pads' volumes no longer overlap at the surface while the far reach is
// preserved.

const pressSpec: FrustumVolumeSpec = {
  nearW: 0.14 * TOUCH_PRESS_NEAR_SCALE,
  nearH: 0.14 * TOUCH_PRESS_NEAR_SCALE,
  nearZ: TOUCH_PRESS_NEAR_Z_M,
  farW: 0.14 * TOUCH_PRESS_FAR_SCALE,
  farH: 0.14 * TOUCH_PRESS_FAR_SCALE,
  farZ: TOUCH_PRESS_FAR_Z_M,
};

test('frustum z slabs straddle the pad plane ~80/20 with the old span', () => {
  // Oded 2026-11-16 ~01:29: the volumes floated above the button plane; lower
  // them so ~80% of the depth is above the pad face and ~20% below it. The
  // old window was [0.295d, 0.92d] in front of the face (span 0.625d).
  expect(TOUCH_PRESS_NEAR_Z_M).toBeCloseTo(-TOUCH_PRESS_DEPTH_M * 0.125, 6);
  expect(TOUCH_PRESS_FAR_Z_M).toBeCloseTo(TOUCH_PRESS_DEPTH_M * 0.5, 6);
  expect(TOUCH_HOVER_NEAR_Z_M).toBeCloseTo(-TOUCH_HOVER_DEPTH_M * 0.125, 6);
  expect(TOUCH_HOVER_FAR_Z_M).toBeCloseTo(TOUCH_HOVER_DEPTH_M * 0.5, 6);
  // 80% of each slab above the plane, 20% below; total span unchanged.
  for (const [nearZ, farZ] of [
    [TOUCH_PRESS_NEAR_Z_M, TOUCH_PRESS_FAR_Z_M],
    [TOUCH_HOVER_NEAR_Z_M, TOUCH_HOVER_FAR_Z_M],
  ]) {
    expect(farZ / (farZ - nearZ)).toBeCloseTo(0.8, 6);
    expect(-nearZ / (farZ - nearZ)).toBeCloseTo(0.2, 6);
  }
  // Far (player-side) faces keep the old uniform box widths.
  expect(TOUCH_PRESS_FAR_SCALE).toBe(TOUCH_PRESS_SCALE);
  expect(TOUCH_HOVER_FAR_SCALE).toBe(TOUCH_HOVER_SCALE);
  // Near (pad-side) faces are at the pad outline, so air-pad volumes taper.
  expect(TOUCH_PRESS_NEAR_SCALE).toBeLessThan(TOUCH_PRESS_FAR_SCALE);
  expect(TOUCH_HOVER_NEAR_SCALE).toBeLessThan(TOUCH_HOVER_FAR_SCALE);
});

test('pointInFrustumVolume rejects past the near face what the old box accepted', () => {
  // Old press box accepted |x| <= sizeM * TOUCH_PRESS_SCALE / 2 at every z.
  // At the near plane the frustum is only nearW wide, so a point inside the
  // old box but outside the pad outline is now outside the volume. This is
  // the anti-overlap property: two air pads spaced by one pad width no
  // longer share volume space at the surface.
  const x = (pressSpec.nearW / 2 + pressSpec.farW / 2) / 2; // between near and far half-width
  expect(x).toBeGreaterThan(pressSpec.nearW / 2);
  expect(x).toBeLessThan(pressSpec.farW / 2);
  expect(pointInFrustumVolume(pressSpec, x, 0, pressSpec.nearZ)).toBe(false);
  expect(pointInFrustumVolume(pressSpec, x, 0, pressSpec.farZ)).toBe(true);
});

test('pointInFrustumVolume keeps the old far-plane reach and center hits', () => {
  const zMid = (pressSpec.nearZ + pressSpec.farZ) / 2;
  // Center of the slab is inside.
  expect(pointInFrustumVolume(pressSpec, 0, 0, zMid)).toBe(true);
  // Full old box width at the far plane is still accepted (x and y).
  expect(pointInFrustumVolume(pressSpec, pressSpec.farW / 2, pressSpec.farH / 2, pressSpec.farZ)).toBe(true);
  // Just outside the interpolated width at mid-slab is rejected.
  const hxMid = (pressSpec.nearW + pressSpec.farW) / 4;
  expect(pointInFrustumVolume(pressSpec, hxMid + 1e-6, 0, zMid)).toBe(false);
  expect(pointInFrustumVolume(pressSpec, hxMid - 1e-6, 0, zMid)).toBe(true);
});

test('pointInFrustumVolume rejects points outside the z slab', () => {
  expect(pointInFrustumVolume(pressSpec, 0, 0, pressSpec.nearZ - 1e-6)).toBe(false);
  expect(pointInFrustumVolume(pressSpec, 0, 0, pressSpec.farZ + 1e-6)).toBe(false);
  // Boundary z values themselves are inside.
  expect(pointInFrustumVolume(pressSpec, 0, 0, pressSpec.nearZ)).toBe(true);
  expect(pointInFrustumVolume(pressSpec, 0, 0, pressSpec.farZ)).toBe(true);
});

test('makeFrustumVolumeMesh builds an 8-corner frustum at the pad origin and tags userData', () => {
  const mesh = makeFrustumVolumeMesh('wall-tone-touch-3', pressSpec);
  expect(mesh.name).toBe('wall-tone-touch-3');
  expect(mesh.position.z).toBe(0);
  expect(mesh.userData.frustum).toBe(pressSpec);
  const pos = mesh.geometry.getAttribute('position');
  expect(pos.count).toBe(8);
  const nx = pressSpec.nearW / 2;
  const ny = pressSpec.nearH / 2;
  const fx = pressSpec.farW / 2;
  const fy = pressSpec.farH / 2;
  // Near face corners sit at nearZ with the near width...
  expect(pos.getX(0)).toBeCloseTo(-nx, 6);
  expect(pos.getY(0)).toBeCloseTo(-ny, 6);
  expect(pos.getZ(0)).toBeCloseTo(pressSpec.nearZ, 6);
  expect(pos.getX(2)).toBeCloseTo(nx, 6);
  expect(pos.getY(2)).toBeCloseTo(ny, 6);
  // ...and far face corners at farZ with the far width.
  expect(pos.getX(4)).toBeCloseTo(-fx, 6);
  expect(pos.getY(4)).toBeCloseTo(-fy, 6);
  expect(pos.getZ(4)).toBeCloseTo(pressSpec.farZ, 6);
  expect(pos.getX(6)).toBeCloseTo(fx, 6);
  expect(pos.getY(6)).toBeCloseTo(fy, 6);
  expect(mesh.geometry.getIndex()!.count).toBe(36); // 12 triangles
});

test('pad touch and hover volumes are wired as frusta; the ray target stays a box', async () => {
  const fs = await import('node:fs/promises');
  const padsSrc = await fs.readFile('src/wall-tones/pads.ts', 'utf8');
  const systemSrc = await fs.readFile('src/wall-tones/wall-tones-system.ts', 'utf8');
  // attachTouchVolumes builds frusta for the fingertip volumes and their
  // debug wireframes...
  const attach = padsSrc.slice(padsSrc.indexOf('function attachTouchVolumes'));
  expect(attach).toContain("makeFrustumVolumeMesh('touch-volume'");
  expect(attach).toContain("makeFrustumVolumeMesh('hover-volume'");
  expect(attach).toContain("'debug-press-volume'");
  expect(attach).toContain("'debug-hover-volume'");
  // ...while the ray/pinch target remains a box (RAY_TARGET_SCALE).
  expect(attach).toContain('makeVolumeMesh(');
  // Resizing a solidified ghost rebuilds frusta too.
  expect(padsSrc).toContain('function frustumSpecFor(');
  // The fingertip sampler branches on the frustum tag before the box path
  // (slot candidates keep their boxes).
  expect(systemSrc).toContain('pointInFrustumVolume(');
  expect(systemSrc).toContain('userData as { frustum?: FrustumVolumeSpec }');
});
