/**
 * Geometry-collision spark particles for the Rift Sealing Lab (backlog item
 * 93): sparks thrown out of a sealing/sealed rift fall under gravity, hit
 * room geometry and bounce before burning out.
 *
 * Pure physics, no rendering and no three imports, so unit tests can load
 * this module directly. The system layer feeds collision surfaces and reads
 * the pool into a Points buffer each frame.
 *
 * Collision surfaces are honest about their source:
 * - `room`: real detected XRPlane surfaces (walls, floor, tables). MR only;
 *   never synthesized on desktop (no pretend walls).
 * - `ground`: the y=0 reference plane the session space itself defines.
 * - `rift-host`: the wall plane a rift sits on, known in every mode because
 *   placement computed it.
 */

export type SurfaceKind = 'room' | 'ground' | 'rift-host';

export type CollisionSurface = {
  /** Unit plane normal; a point p is in front of the plane when n·p > d. */
  nx: number;
  ny: number;
  nz: number;
  /** Plane offset: n·p = d for points on the plane. */
  d: number;
  /** Origin point on the plane (bounds reference). */
  px: number;
  py: number;
  pz: number;
  /** In-plane unit basis vectors. */
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  /** Local bounds along u/v; +-Infinity for an unbounded plane. */
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  kind: SurfaceKind;
};

export type GeometryParticlePool = {
  max: number;
  alive: number;
  /** Total sparks emitted since the pool was created (debug/QA). */
  emitted: number;
  /** Total surface impacts since the pool was created (debug/QA). */
  collisions: number;
  /** Impacts per surface kind since the pool was created. */
  roomImpacts: number;
  groundImpacts: number;
  riftHostImpacts: number;
  pos: Float32Array;
  vel: Float32Array;
  /** Remaining life in seconds; <= 0 marks a dead slot. */
  life: Float32Array;
  maxLife: Float32Array;
  col: Float32Array;
  bounces: Uint8Array;
};

/** Sparks lighter than rock: stylized fall, fast enough to read on Quest. */
const GRAVITY_MPS2 = 3.6;
/** Bounce energy kept (normal component). */
const RESTITUTION = 0.42;
/** Tangential speed kept per bounce. */
const FRICTION = 0.72;
/** Skin distance keeping bouncing sparks off the plane. */
const SKIN_M = 0.012;
/** Below this speed a bouncing spark dies instead of jittering. */
const KILL_SPEED_MPS = 0.22;
const MAX_BOUNCES = 2;

export function createGeometryParticlePool(max: number): GeometryParticlePool {
  return {
    max,
    alive: 0,
    emitted: 0,
    collisions: 0,
    roomImpacts: 0,
    groundImpacts: 0,
    riftHostImpacts: 0,
    pos: new Float32Array(max * 3),
    vel: new Float32Array(max * 3),
    life: new Float32Array(max),
    maxLife: new Float32Array(max),
    col: new Float32Array(max * 3),
    bounces: new Uint8Array(max),
  };
}

function claimSlot(pool: GeometryParticlePool): number {
  for (let i = 0; i < pool.max; i++) {
    if (pool.life[i]! <= 0) return i;
  }
  return -1;
}

/**
 * Spray sparks out of a rift into the room. `dir` is the wall/rift outward
 * normal; velocities fan around it with an up bias, so sparks arc, fall and
 * meet the floor, nearby walls and the rift's own host wall.
 */
export function emitSpray(
  pool: GeometryParticlePool,
  ox: number,
  oy: number,
  oz: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  count: number,
  color: [number, number, number],
  speedMin = 0.7,
  speedMax = 1.7,
): number {
  let spawned = 0;
  for (let n = 0; n < count; n++) {
    const slot = claimSlot(pool);
    if (slot < 0) break;
    const i3 = slot * 3;
    // Random unit-ish spread, biased along dir, slight up bias for the arc.
    const rx = Math.random() * 2 - 1;
    const ry = Math.random() * 2 - 1 + 0.35;
    const rz = Math.random() * 2 - 1;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    let vx = dirX * speed + rx * 0.55 * speed;
    let vy = dirY * speed + ry * 0.55 * speed;
    let vz = dirZ * speed + rz * 0.55 * speed;
    const len = Math.hypot(vx, vy, vz) || 1;
    vx = (vx / len) * speed;
    vy = (vy / len) * speed;
    vz = (vz / len) * speed;
    pool.pos[i3] = ox;
    pool.pos[i3 + 1] = oy;
    pool.pos[i3 + 2] = oz;
    pool.vel[i3] = vx;
    pool.vel[i3 + 1] = vy;
    pool.vel[i3 + 2] = vz;
    pool.col[i3] = color[0];
    pool.col[i3 + 1] = color[1];
    pool.col[i3 + 2] = color[2];
    pool.maxLife[slot] = 0.9 + Math.random() * 0.7;
    pool.life[slot] = pool.maxLife[slot]!;
    pool.bounces[slot] = 0;
    spawned++;
  }
  pool.emitted += spawned;
  return spawned;
}

function withinBounds(s: CollisionSurface, x: number, y: number, z: number): boolean {
  if (s.minU === Number.NEGATIVE_INFINITY) return true;
  const rx = x - s.px;
  const ry = y - s.py;
  const rz = z - s.pz;
  const u = rx * s.ux + ry * s.uy + rz * s.uz;
  const v = rx * s.vx + ry * s.vy + rz * s.vz;
  return u >= s.minU && u <= s.maxU && v >= s.minV && v <= s.maxV;
}

/**
 * Advance the pool. Sparks integrate gravity, then collide against every
 * surface: a crossing moving into the plane reflects with restitution and
 * tangential friction, flashes white and burns faster. Returns nothing; read
 * the counters.
 */
export function stepGeometryParticles(
  pool: GeometryParticlePool,
  dt: number,
  surfaces: readonly CollisionSurface[],
): void {
  if (dt <= 0) return;
  let alive = 0;
  for (let slot = 0; slot < pool.max; slot++) {
    if (pool.life[slot]! <= 0) continue;
    const i3 = slot * 3;
    pool.life[slot] = pool.life[slot]! - dt;
    if (pool.life[slot]! <= 0) {
      pool.col[i3] = 0;
      pool.col[i3 + 1] = 0;
      pool.col[i3 + 2] = 0;
      continue;
    }
    pool.vel[i3 + 1] = pool.vel[i3 + 1]! - GRAVITY_MPS2 * dt;
    let x = pool.pos[i3]! + pool.vel[i3]! * dt;
    let y = pool.pos[i3 + 1]! + pool.vel[i3 + 1]! * dt;
    let z = pool.pos[i3 + 2]! + pool.vel[i3 + 2]! * dt;
    for (const s of surfaces) {
      const dist = x * s.nx + y * s.ny + z * s.nz - s.d;
      if (dist >= SKIN_M) continue;
      let vx = pool.vel[i3]!;
      let vy = pool.vel[i3 + 1]!;
      let vz = pool.vel[i3 + 2]!;
      const vn = vx * s.nx + vy * s.ny + vz * s.nz;
      if (vn >= 0) continue; // moving away already
      if (!withinBounds(s, x, y, z)) continue;
      // Reflect the normal component, damp the tangential one.
      const rvx = vx - (1 + RESTITUTION) * vn * s.nx;
      const rvy = vy - (1 + RESTITUTION) * vn * s.ny;
      const rvz = vz - (1 + RESTITUTION) * vn * s.nz;
      // Damp the tangential part of the reflected velocity (friction).
      const rn = rvx * s.nx + rvy * s.ny + rvz * s.nz;
      const fx = (rvx - rn * s.nx) * FRICTION;
      const fy = (rvy - rn * s.ny) * FRICTION;
      const fz = (rvz - rn * s.nz) * FRICTION;
      vx = fx + rn * s.nx;
      vy = fy + rn * s.ny;
      vz = fz + rn * s.nz;
      pool.vel[i3] = vx;
      pool.vel[i3 + 1] = vy;
      pool.vel[i3 + 2] = vz;
      // Push back to the skin so the next frame starts in front.
      x += s.nx * (SKIN_M - dist);
      y += s.ny * (SKIN_M - dist);
      z += s.nz * (SKIN_M - dist);
      pool.collisions++;
      if (s.kind === 'room') pool.roomImpacts++;
      else if (s.kind === 'ground') pool.groundImpacts++;
      else pool.riftHostImpacts++;
      pool.bounces[slot] = pool.bounces[slot]! + 1;
      // Impact flash: hot white, then burn out faster.
      pool.col[i3] = Math.min(1, pool.col[i3]! + 0.85);
      pool.col[i3 + 1] = Math.min(1, pool.col[i3 + 1]! + 0.85);
      pool.col[i3 + 2] = Math.min(1, pool.col[i3 + 2]! + 0.85);
      pool.life[slot] = Math.min(pool.life[slot]!, pool.maxLife[slot]! * 0.45);
      const speed = Math.hypot(vx, vy, vz);
      if (pool.bounces[slot]! > MAX_BOUNCES || speed < KILL_SPEED_MPS) {
        pool.life[slot] = 0;
        pool.col[i3] = 0;
        pool.col[i3 + 1] = 0;
        pool.col[i3 + 2] = 0;
        x = 0;
        y = -999;
        z = 0;
        break;
      }
    }
    pool.pos[i3] = x;
    pool.pos[i3 + 1] = y;
    pool.pos[i3 + 2] = z;
    // Fade toward black over life (additive blending reads black as gone).
    const fade = Math.min(1, pool.life[slot]! / (pool.maxLife[slot]! * 0.5));
    if (fade < 1) {
      pool.col[i3]! *= fade;
      pool.col[i3 + 1]! *= fade;
      pool.col[i3 + 2]! *= fade;
    }
    if (pool.life[slot]! > 0) alive++;
  }
  pool.alive = alive;
}

/** Unbounded plane through `point` with the given unit normal. */
export function planeSurface(
  kind: SurfaceKind,
  nx: number,
  ny: number,
  nz: number,
  px: number,
  py: number,
  pz: number,
): CollisionSurface {
  // Any in-plane orthonormal basis.
  const aux = Math.abs(ny) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const ux = aux.y * nz - aux.z * ny;
  const uy = aux.z * nx - aux.x * nz;
  const uz = aux.x * ny - aux.y * nx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const ux2 = ux / ul;
  const uy2 = uy / ul;
  const uz2 = uz / ul;
  return {
    nx,
    ny,
    nz,
    d: nx * px + ny * py + nz * pz,
    px,
    py,
    pz,
    ux: ux2,
    uy: uy2,
    uz: uz2,
    vx: ny * uz2 - nz * uy2,
    vy: nz * ux2 - nx * uz2,
    vz: nx * uy2 - ny * ux2,
    minU: Number.NEGATIVE_INFINITY,
    maxU: Number.POSITIVE_INFINITY,
    minV: Number.NEGATIVE_INFINITY,
    maxV: Number.POSITIVE_INFINITY,
    kind,
  };
      }
