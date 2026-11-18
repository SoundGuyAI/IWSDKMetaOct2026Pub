/**
 * Pure animation math for the menu cover stage (cover-stage.ts). Kept free of
 * three/IWSDK imports so unit tests can exercise it directly.
 */

/** Spectrum strip along the bottom of the cover: bar count and height range. */
export const SPECTRUM_BAR_COUNT = 48;
export const SPECTRUM_MIN_HEIGHT_M = 0.04;
export const SPECTRUM_MAX_HEIGHT_M = 0.42;

/**
 * Height of one equalizer bar at time t: two travelling sine waves blended,
 * always inside [SPECTRUM_MIN_HEIGHT_M, SPECTRUM_MAX_HEIGHT_M].
 */
export function spectrumBarHeight(index: number, t: number): number {
  const wave =
    0.62 * (0.5 + 0.5 * Math.sin(t * 2.1 + index * 0.55)) +
    0.38 * (0.5 + 0.5 * Math.sin(t * 3.7 - index * 0.31 + 1.7));
  return (
    SPECTRUM_MIN_HEIGHT_M +
    (SPECTRUM_MAX_HEIGHT_M - SPECTRUM_MIN_HEIGHT_M) * wave
  );
}

/** Circular-orbit parameters for one musical note around the pad grid. */
export type NoteOrbit = {
  radius: number;
  /** Radians per second; sign sets the direction. */
  angularSpeed: number;
  /** Orbit-plane tilts (radians) so notes circle the pads in 3D, not flat. */
  tiltX: number;
  tiltZ: number;
  phase: number;
};

/** Four notes (one per pad color), each on its own tilted 3D orbit. */
export const NOTE_ORBITS: readonly NoteOrbit[] = [
  { radius: 0.42, angularSpeed: 0.55, tiltX: 0.42, tiltZ: 0.1, phase: 0 },
  { radius: 0.5, angularSpeed: -0.42, tiltX: -0.3, tiltZ: -0.22, phase: 1.9 },
  { radius: 0.37, angularSpeed: 0.68, tiltX: 0.18, tiltZ: 0.5, phase: 3.4 },
  { radius: 0.55, angularSpeed: -0.5, tiltX: -0.48, tiltZ: 0.28, phase: 5.1 },
];

/** Position of a note on its tilted circular orbit, relative to pad center. */
export function noteOrbitPosition(
  orbit: NoteOrbit,
  t: number,
): { x: number; y: number; z: number } {
  const angle = orbit.phase + t * orbit.angularSpeed;
  const cx = Math.cos(angle) * orbit.radius;
  const cz = Math.sin(angle) * orbit.radius;
  // Tilt around X, then around Z (fixed order keeps the path deterministic).
  const y1 = -cz * Math.sin(orbit.tiltX);
  const z1 = cz * Math.cos(orbit.tiltX);
  const x2 = cx * Math.cos(orbit.tiltZ) - y1 * Math.sin(orbit.tiltZ);
  const y2 = cx * Math.sin(orbit.tiltZ) + y1 * Math.cos(orbit.tiltZ);
  return { x: x2, y: y2, z: z1 };
}

/** Fanfare idle flash: one full light-up cycle across the pads, then a rest. */
export const FANFARE_STEP_S = 0.55;
export const FANFARE_FLASH_S = 0.5;
export const FANFARE_REST_S = 1.6;

/** Seconds between the starts of two fanfare cycles. */
export function fanfareCycleSeconds(padCount: number): number {
  return padCount * FANFARE_STEP_S + FANFARE_REST_S;
}

/**
 * Flash envelope (0..1, smooth triangle) for the pad sitting at `slot` in the
 * fanfare order at time t. At most one slot is above ~0.5 at any moment.
 */
export function fanfareFlash(slot: number, t: number, padCount: number): number {
  const cycle = fanfareCycleSeconds(padCount);
  const local = ((t % cycle) + cycle) % cycle;
  const start = slot * FANFARE_STEP_S;
  if (local < start || local > start + FANFARE_FLASH_S) {
    return 0;
  }
  const phase = (local - start) / FANFARE_FLASH_S;
  return 1 - Math.abs(phase * 2 - 1);
}
