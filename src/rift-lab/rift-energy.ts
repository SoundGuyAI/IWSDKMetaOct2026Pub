/**
 * Rift-sealing Lab mini-game (backlog item 75): pure game logic.
 *
 * Requested by Oded 2026-11-13 12:15 (verbatim in WALL_TONES_TODO.md item 75):
 * every successful note charges the player's hands with energy shown as
 * glowing note particles orbiting both hands (prominently the firing one);
 * rifts open in the room; the player seals them by aiming hand energy at
 * them. Lab-only prototype: placeholder rifts, final animated art is a
 * later dedicated PR.
 *
 * This module has no IWSDK/three dependencies so the rules stay unit-testable
 * everywhere. The IWSDK system in rift-lab-system.ts renders and wires it.
 *
 * UNRESOLVED mechanics (held for Oded, do not invent defaults here):
 *  - PC click target: click-rift-directly vs click-fires-orbiting-notes.
 *    onPcClick() is a deliberate no-op hook until he picks one.
 *  - Open-rift negative modifier identity. His rule (12:18, verbatim):
 *    "the rifts would need to be cleared and while they are there will be a
 *    negative modifier" - the modifier applies while a rift is open and lifts
 *    when it is cleared. openRiftModifierActive() implements exactly that
 *    gate; the effect itself stays a named no-op (OPEN_RIFT_MODIFIER_EFFECT).
 */

/** Pad palette, exact hex from src/wall-tones/constants.ts. */
export const PAD_COLORS = {
  green: '#2ecc71',
  red: '#e74c3c',
  blue: '#3498db',
  yellow: '#f1c40f',
} as const;

export type PadColorName = keyof typeof PAD_COLORS;
export const PAD_COLOR_NAMES = Object.keys(PAD_COLORS) as PadColorName[];

export type HandSide = 'left' | 'right';

/** Energy economy. */
export const ENERGY_PER_NOTE = 10;
export const MAX_ENERGY = 100;
/** A seal beam drains this much energy per second while held on a rift. */
export const BEAM_DRAIN_PER_SECOND = 25;
/** Beam must stay on one rift this long to seal it. */
export const SEAL_HOLD_MS = 1500;
/** Energy cost to start firing a beam at all. */
export const BEAM_MIN_ENERGY = 10;

/** Orbit note visuals (logic side; rendering reads these). */
export const NOTE_ORBIT_RADIUS_M = 0.09;
export const NOTE_ORBIT_SPEED_RAD_PER_SEC = 2.4;
/** Share of new notes that orbit the firing hand; the rest go to the other. */
export const FIRING_HAND_NOTE_SHARE = 0.7;
/** Cap so long runs do not grow the orbit cloud without bound. */
export const MAX_ORBIT_NOTES = 48;

/**
 * UNRESOLVED: what the open-rift negative modifier does. Placeholder effect
 * is intentionally a no-op; only the until-cleared gate below is settled.
 */
export const OPEN_RIFT_MODIFIER_EFFECT = null as null;

export interface OrbitNote {
  readonly id: number;
  readonly color: PadColorName;
  readonly hand: HandSide;
  /** Current orbit angle; the system advances it each frame. */
  angle: number;
  readonly radius: number;
  readonly speed: number;
}

export type RiftState = 'opening' | 'open' | 'sealing' | 'sealed';

export interface Rift {
  readonly id: number;
  /** Placeholder fracture: each edge takes a pad color (style D, 12:27). */
  readonly edgeColors: readonly [PadColorName, PadColorName, PadColorName, PadColorName];
  state: RiftState;
  /** Milliseconds the beam has been held on this rift. */
  sealProgressMs: number;
}

export type FireInput =
  | { kind: 'xr-open-palm'; hand: HandSide }
  | { kind: 'mobile-drag'; dx: number; dy: number };

export class RiftLabGame {
  private energy = 0;
  private readonly notes: OrbitNote[] = [];
  private readonly rifts: Rift[] = [];
  private nextNoteId = 1;
  private nextRiftId = 1;
  private firingHand: HandSide = 'right';
  private beamActive = false;
  private beamHand: HandSide | null = null;
  /** Random source injected so tests are deterministic. */
  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  getEnergy(): number {
    return this.energy;
  }

  getNotes(): readonly OrbitNote[] {
    return this.notes;
  }

  getRifts(): readonly Rift[] {
    return this.rifts;
  }

  getFiringHand(): HandSide {
    return this.firingHand;
  }

  isBeamActive(): boolean {
    return this.beamActive;
  }

  getBeamHand(): HandSide | null {
    return this.beamHand;
  }

  /** Every successful note charges the hands (his 12:15 request). */
  addNoteEnergy(color: PadColorName, hand?: HandSide): void {
    if (hand != null) {
      this.firingHand = hand;
    }
    this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_PER_NOTE);
    if (this.notes.length < MAX_ORBIT_NOTES) {
      const toFiring = this.rand() < FIRING_HAND_NOTE_SHARE;
      const noteHand: HandSide = toFiring
        ? this.firingHand
        : this.firingHand === 'right'
          ? 'left'
          : 'right';
      this.notes.push({
        id: this.nextNoteId++,
        color,
        hand: noteHand,
        angle: this.rand() * Math.PI * 2,
        radius: NOTE_ORBIT_RADIUS_M,
        speed: NOTE_ORBIT_SPEED_RAD_PER_SEC,
      });
    }
  }

  /** Advance orbit angles; the renderer reads angles for placement. */
  updateOrbit(dtSeconds: number): void {
    for (const note of this.notes) {
      note.angle = (note.angle + note.speed * dtSeconds) % (Math.PI * 2);
    }
  }

  /** Spawn a placeholder four-color fracture rift. */
  spawnRift(): Rift {
    const shuffled = [...PAD_COLOR_NAMES];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const rift: Rift = {
      id: this.nextRiftId++,
      edgeColors: shuffled.slice(0, 4) as unknown as Rift['edgeColors'],
      state: 'open',
      sealProgressMs: 0,
    };
    this.rifts.push(rift);
    return rift;
  }

  /**
   * His settled rule: while any rift is open the negative modifier applies;
   * it lifts only when the rift is cleared. The effect is UNRESOLVED and
   * stays a no-op (OPEN_RIFT_MODIFIER_EFFECT) until Oded picks it.
   */
  openRiftModifierActive(): boolean {
    return this.rifts.some((rift) => rift.state === 'open' || rift.state === 'opening');
  }

  canFireBeam(): boolean {
    return this.energy >= BEAM_MIN_ENERGY;
  }

  /** Begin firing from an approved input (XR open palm or mobile drag). */
  startBeam(input: FireInput): boolean {
    if (!this.canFireBeam()) {
      return false;
    }
    this.beamActive = true;
    this.beamHand = input.kind === 'xr-open-palm' ? input.hand : this.firingHand;
    return true;
  }

  stopBeam(): void {
    this.beamActive = false;
    this.beamHand = null;
    for (const rift of this.rifts) {
      if (rift.state === 'sealing') {
        rift.state = 'open';
      }
    }
  }

  /**
   * Hold the beam on a rift. Drains energy over time and seals the rift
   * after SEAL_HOLD_MS of contact. Returns the affected rift, if any.
   */
  applyBeamOnRift(riftId: number, dtMs: number): Rift | null {
    if (!this.beamActive) {
      return null;
    }
    const rift = this.rifts.find((candidate) => candidate.id === riftId);
    if (rift == null || rift.state === 'sealed') {
      return null;
    }
    const drain = (BEAM_DRAIN_PER_SECOND * dtMs) / 1000;
    // Clamp to the energy left: a weak beam makes partial progress, then dies.
    const applied = Math.min(drain, this.energy);
    this.energy -= applied;
    rift.state = 'sealing';
    rift.sealProgressMs += dtMs * (applied / drain);
    if (this.energy <= 0 && rift.sealProgressMs < SEAL_HOLD_MS) {
      this.stopBeam();
      return rift;
    }
    if (rift.sealProgressMs >= SEAL_HOLD_MS) {
      rift.state = 'sealed';
      this.stopBeam();
    }
    return rift;
  }

  /** Remove sealed rifts from the room (the modifier already lifted at seal). */
  clearSealed(): number {
    let cleared = 0;
    for (let i = this.rifts.length - 1; i >= 0; i--) {
      if (this.rifts[i].state === 'sealed') {
        this.rifts.splice(i, 1);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * UNRESOLVED: PC click target. Click-the-rift-directly vs
   * click-fires-orbiting-notes are both on the table; until Oded picks one a
   * PC click deliberately does nothing. Returns 'unresolved' so callers and
   * tests cannot mistake the no-op for a settled mechanic.
   */
  onPcClick(): 'unresolved' {
    return 'unresolved';
  }
}
