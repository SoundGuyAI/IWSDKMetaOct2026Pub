/**
 * Movement tracking research (backlog item 30, owner request Nov 7 + Nov 11):
 * estimate how much the player moves in MR from the headset's tracked
 * position, and estimate pad reach from the 3D distances between correctly
 * pressed pads. Session values show on the in-game menu as one line with
 * both fields (MR only; owner layout call Nov 11), and lifetime totals
 * persist locally to feed the provisional Movement achievement.
 *
 * Research constraints (owner, Nov 11):
 * - This is NOT a step, fitness or health measurement: no step counts, no
 *   calories, no health claims. Pad reach is a reach estimate between pads,
 *   not how far the player actually walked.
 * - Head sway and re-centering are filtered, but every value is an estimate
 *   that still needs headset validation before any scoring is settled.
 * - Privacy: only two running totals are stored (localStorage). No position
 *   history is recorded or leaves the device; clearing site data erases it.
 */

const HEAD_METERS_KEY = 'wall-tones-move-head-m';
const PAD_METERS_KEY = 'wall-tones-move-pad-m';

/** Storage keys, so the debug stats reset can clear them too. */
export const MOVEMENT_STORAGE_KEYS: readonly string[] = [HEAD_METERS_KEY, PAD_METERS_KEY];

/** Head micro-sway inside this radius of the last committed point is ignored. */
export const MOVE_DEAD_ZONE_M = 0.05;
/** Faster horizontal head motion is re-centering or a tracking glitch. */
export const MOVE_MAX_SPEED_MPS = 2.5;
/** Pads live in one room; larger jumps are a bad sample, not a real reach. */
export const MAX_PAD_REACH_M = 25;

function readMeters(key: string): number {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const value = raw == null ? 0 : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeMeters(key: string, value: number): void {
  try {
    globalThis.localStorage?.setItem(key, String(Math.round(value * 100) / 100));
  } catch {
    /* session may be private */
  }
}

/** Lifetime combined movement (headset + pad reach) read straight from
 * storage: the provisional Movement achievement value. Rounded to 0.1 m so
 * the achievements popup never shows a long float. */
export function readLifetimeMovementMeters(): number {
  return Math.round((readMeters(HEAD_METERS_KEY) + readMeters(PAD_METERS_KEY)) * 10) / 10;
}

/** One-decimal meter labels shared by the menu line and the research notes. */
export function formatMeters(meters: number): string {
  return `${(Math.round(meters * 10) / 10).toFixed(1)} m`;
}

export class MovementTracker {
  private sessionHeadM = 0;
  private sessionPadM = 0;
  private lifetimeHeadM = readMeters(HEAD_METERS_KEY);
  private lifetimePadM = readMeters(PAD_METERS_KEY);
  // Head sampling state: the latest sample (for the speed cap) and the last
  // committed anchor (for the dead-zone) are tracked separately.
  private haveSample = false;
  private sampleX = 0;
  private sampleZ = 0;
  private sampleT = 0;
  private anchorX = 0;
  private anchorZ = 0;
  // Pad reach state.
  private havePadAnchor = false;
  private padX = 0;
  private padY = 0;
  private padZ = 0;

  /**
   * One headset world-position sample per frame. Only horizontal (XZ) motion
   * counts: vertical bob is sway or nodding, not locomotion. Samples are
   * ignored outside immersive sessions, and re-entering XR re-anchors so the
   * gap never counts as a jump.
   */
  noteHeadPosition(x: number, _y: number, z: number, immersive: boolean, nowSeconds: number): void {
    if (!immersive || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(nowSeconds)) {
      this.haveSample = false;
      return;
    }
    if (!this.haveSample) {
      this.reanchor(x, z, nowSeconds);
      return;
    }
    const dt = nowSeconds - this.sampleT;
    if (dt <= 0) return;
    const step = Math.hypot(x - this.sampleX, z - this.sampleZ);
    if (step / dt > MOVE_MAX_SPEED_MPS) {
      // Teleport, re-centering or tracking loss: re-anchor, count nothing.
      this.reanchor(x, z, nowSeconds);
      return;
    }
    this.sampleX = x;
    this.sampleZ = z;
    this.sampleT = nowSeconds;
    // Count only travel that leaves the dead-zone around the last committed
    // point, then commit there. Sway under MOVE_DEAD_ZONE_M never adds up.
    const travelled = Math.hypot(x - this.anchorX, z - this.anchorZ);
    if (travelled >= MOVE_DEAD_ZONE_M) {
      this.sessionHeadM += travelled;
      this.lifetimeHeadM += travelled;
      writeMeters(HEAD_METERS_KEY, this.lifetimeHeadM);
      this.anchorX = x;
      this.anchorZ = z;
    }
  }

  private reanchor(x: number, z: number, nowSeconds: number): void {
    this.sampleX = x;
    this.sampleZ = z;
    this.sampleT = nowSeconds;
    this.anchorX = x;
    this.anchorZ = z;
    this.haveSample = true;
  }

  /**
   * Correct pad press world position: the reach estimate is the 3D distance
   * from the previously correctly pressed pad (wall pads differ in height,
   * so unlike head movement this keeps Y). The first press only anchors.
   * Flat-mode pads are a fixed on-screen grid, not a reach, so only
   * immersive presses count.
   */
  noteCorrectPadPress(x: number, y: number, z: number, immersive: boolean): void {
    if (!immersive || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      this.havePadAnchor = false;
      return;
    }
    if (!this.havePadAnchor) {
      this.padX = x;
      this.padY = y;
      this.padZ = z;
      this.havePadAnchor = true;
      return;
    }
    const reach = Math.hypot(x - this.padX, y - this.padY, z - this.padZ);
    this.padX = x;
    this.padY = y;
    this.padZ = z;
    if (reach <= MAX_PAD_REACH_M) {
      this.sessionPadM += reach;
      this.lifetimePadM += reach;
      writeMeters(PAD_METERS_KEY, this.lifetimePadM);
    }
  }

  /** New pad layout (setup, re-scan or respawn): next correct press re-anchors. */
  resetPadAnchor(): void {
    this.havePadAnchor = false;
  }

  getSessionHeadMeters(): number {
    return this.sessionHeadM;
  }

  getSessionPadMeters(): number {
    return this.sessionPadM;
  }

  getLifetimeHeadMeters(): number {
    return this.lifetimeHeadM;
  }

  getLifetimePadMeters(): number {
    return this.lifetimePadM;
  }
}
