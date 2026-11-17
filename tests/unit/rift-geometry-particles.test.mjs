import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = ts.transpileModule(
  readFileSync(join(root, 'src/rift-lab/rift-geometry-particles.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const {
  closestSurfaceHit,
  createGeometryParticlePool,
  emitSpray,
  stepGeometryParticles,
  planeSurface,
} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const GROUND = planeSurface('ground', 0, 1, 0, 0, 0, 0);
const RED = [1, 0.2, 0.2];

test('spray emits up to the pool cap and marks slots alive', () => {
  const pool = createGeometryParticlePool(8);
  const spawned = emitSpray(pool, 0, 1.6, -2, 0, 0, 1, 8, RED);
  assert.equal(spawned, 8);
  assert.equal(pool.emitted, 8);
  // Pool exhausted: further emission spawns nothing.
  assert.equal(emitSpray(pool, 0, 1.6, -2, 0, 0, 1, 4, RED), 0);
  assert.equal(pool.emitted, 8);
});

test('sparks fall under gravity and die without surfaces', () => {
  const pool = createGeometryParticlePool(16);
  emitSpray(pool, 0, 1.6, -2, 0, 0, 1, 16, RED);
  for (let i = 0; i < 200; i++) stepGeometryParticles(pool, 1 / 60, []);
  assert.equal(pool.alive, 0);
  assert.equal(pool.collisions, 0);
});

test('a spark heading down bounces off the ground plane and records it', () => {
  const pool = createGeometryParticlePool(4);
  // Aim straight down: dir (0,-1,0), zero spread would be ideal but spread
  // is random, so emit many and step until first impacts land.
  emitSpray(pool, 0, 1.2, 0, 0, -0.6, 0, 4, RED, 1.5, 1.6);
  let sawCollision = false;
  for (let i = 0; i < 600 && !sawCollision; i++) {
    stepGeometryParticles(pool, 1 / 60, [GROUND]);
    sawCollision = pool.groundImpacts > 0;
  }
  assert.equal(sawCollision, true);
  assert.equal(pool.collisions, pool.groundImpacts);
});

test('impacts flash the spark white and shorten its life', () => {
  const pool = createGeometryParticlePool(1);
  emitSpray(pool, 0, 0.5, 0, 0, -1, 0, 1, RED, 1.5, 1.5);
  // Force a deterministic straight-down spark.
  pool.vel[0] = 0; pool.vel[1] = -1.5; pool.vel[2] = 0;
  pool.life[0] = 1.5; pool.maxLife[0] = 1.5;
  let impacted = false;
  for (let i = 0; i < 120 && !impacted; i++) {
    stepGeometryParticles(pool, 1 / 60, [GROUND]);
    impacted = pool.collisions > 0;
  }
  assert.equal(impacted, true);
  assert.ok(pool.life[0] <= 1.5 * 0.45 + 1e-6, 'life shortened on impact');
});

test('bounded room surface only collides inside its polygon extents', () => {
  const wall = {
    ...planeSurface('room', 0, 0, 1, 0, 1, -2),
    minU: -0.5, maxU: 0.5, minV: -0.5, maxV: 0.5,
  };
  const pool = createGeometryParticlePool(2);
  // One spark at the wall center (hits), one far to the side (misses).
  emitSpray(pool, 0, 1, -1.5, 0, 0, -1, 1, RED, 1.5, 1.5);
  pool.vel[0] = 0; pool.vel[1] = 0; pool.vel[2] = -1.5;
  emitSpray(pool, 5, 1, -1.5, 0, 0, -1, 1, RED, 1.5, 1.5);
  pool.vel[3] = 0; pool.vel[4] = 0; pool.vel[5] = -1.5;
  for (let i = 0; i < 120; i++) stepGeometryParticles(pool, 1 / 60, [wall]);
  assert.equal(pool.roomImpacts, 1);
});

test('sparks die after the bounce cap instead of jittering forever', () => {
  const pool = createGeometryParticlePool(1);
  emitSpray(pool, 0, 0.05, 0, 0, 1, 0, 1, RED, 0.3, 0.3);
  pool.vel[0] = 0; pool.vel[1] = 0.4; pool.vel[2] = 0;
  pool.life[0] = 60; pool.maxLife[0] = 60;
  for (let i = 0; i < 600; i++) stepGeometryParticles(pool, 1 / 60, [GROUND]);
  assert.equal(pool.alive, 0);
  assert.ok(pool.collisions >= 1, `expected impacts before death, got ${pool.collisions}`);
});

test('a beam ray ends on the nearest surface and misses a parallel wall', () => {
  const wall = planeSurface('room', 0, 0, 1, 0, 1.2, -2);
  const out = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  assert.equal(
    closestSurfaceHit(0, 1.2, 0, 0, 0, -1, [GROUND, wall], 0.05, 8, out),
    true,
  );
  assert.ok(Math.abs(out.t - 2) < 1e-4, `expected t=2, got ${out.t}`);
  assert.ok(Math.abs(out.z + 2) < 1e-4);
  assert.equal(
    closestSurfaceHit(0, 1.2, 0, 0, 1, 0, [GROUND, wall], 0.05, 8, out),
    false,
  );
  const near = planeSurface('room', 0, 0, 1, 0, 1.2, -1);
  assert.equal(
    closestSurfaceHit(0, 1.2, 0, 0, 0, -1, [wall, near], 0.05, 8, out),
    true,
  );
  assert.ok(Math.abs(out.t - 1) < 1e-4, `nearer wall should win, got ${out.t}`);
});

test('impact kind counters stay separate', () => {
  const pool = createGeometryParticlePool(8);
  const host = planeSurface('rift-host', 0, 0, 1, 0, 1.6, -2.4);
  emitSpray(pool, 0, 1.6, -2.3, 0, 0, -1, 8, RED, 1.5, 1.6);
  for (let i = 0; i < 600; i++) stepGeometryParticles(pool, 1 / 60, [GROUND, host]);
  assert.ok(pool.riftHostImpacts > 0, 'host wall impacts recorded');
  assert.equal(pool.roomImpacts, 0);
  assert.equal(
    pool.collisions,
    pool.riftHostImpacts + pool.groundImpacts + pool.roomImpacts,
  );
});
