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
/**
 * Charge cap: two full closures of headroom, so the cap never sits below the
 * seal threshold (a cap under SEAL_ENERGY_REQUIRED would make sealing
 * impossible). Initial tuning 14:46, tunable after testing.
 */
export const MAX_ENERGY = 240;
/**
 * A seal beam drains this much energy per second while held on a rift.
 * 80/s means one full SEAL_HOLD_MS hold costs exactly SEAL_ENERGY_REQUIRED,
 * so the shared enough-energy gate always funds one complete seal and never
 * strands a beam at partial progress.
 */
export const BEAM_DRAIN_PER_SECOND = 80;
/** Beam must stay on one rift this long to seal it. */
export const SEAL_HOLD_MS = 1500;
/**
 * "Enough energy" gate, settled 13:38: sealing needs enough energy on EVERY
 * platform (desktop click, mobile drag, XR palm). Threshold settled 14:46:
 * 12 successful notes charge one rift closure (12 x ENERGY_PER_NOTE = 120).
 * Initial tuning under his 10-15 note guidance; tunable after testing.
 */
export const SEAL_ENERGY_REQUIRED = 120;
/** Energy cost to start firing a beam at all. */
export const BEAM_MIN_ENERGY = SEAL_ENERGY_REQUIRED;
/** Desktop seal: energy deducted when the click fires the notes. */
export const DESKTOP_SEAL_COST = SEAL_ENERGY_REQUIRED;
/** Desktop seal: notes fly pointer-to-rift, then the rift seals. Pure
 * animation timing, NOT a hold-to-seal duration (none was approved). */
export const DESKTOP_NOTES_FLIGHT_MS = 800;

/**
 * Lab panel rect in the click-projection space (flat mode): clicks over the
 * panel are UI interaction, not world clicks, and must not raycast-seal a
 * rift behind it (14:38 live test: the note button sealed a rift).
 */
export const LAB_PANEL_RECT = {
  halfWidth: 0.95,
  minY: 1.05,
  maxY: 2.55,
} as const;

/** True when a projected desktop click lands on the Lab panel. */
export function isOverLabPanel(point: { x: number; y: number }): boolean {
  return (
    Math.abs(point.x) <= LAB_PANEL_RECT.halfWidth &&
    point.y >= LAB_PANEL_RECT.minY &&
    point.y <= LAB_PANEL_RECT.maxY
  );
}

/** Orbit note visuals (logic side; rendering reads these). */
export const NOTE_ORBIT_RADIUS_M = 0.09;
export const NOTE_ORBIT_SPEED_RAD_PER_SEC = 2.4;
/** Share of new notes that orbit the firing hand; the rest go to the other. */
export const FIRING_HAND_NOTE_SHARE = 0.7;
/** Cap so long runs do not grow the orbit cloud without bound. */
export const MAX_ORBIT_NOTES = 48;

/**
 * Open-rift negative modifier, settled by Oded 13:38 (verbatim): "less
 * score/bars for now. it's like the opposite of a mulripliet modifier it's a
 * fractional mulitplier". Applies while any rift is open, lifts when cleared.
 * Fraction settled 14:46: x0.5 while a rift is open - initial tuning under
 * his "choose arbitrary numbers" delegation, tunable after testing.
 */
export const OPEN_RIFT_MODIFIER_KIND = 'fractional-score-bars-multiplier' as const;
export const OPEN_RIFT_MODIFIER_FRACTION = 0.5;

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

  /**
   * The fractional score/bars multiplier currently in force: 1 when no rift
   * is open, the (provisional) fraction while one is open until cleared.
   */
  openRiftScoreMultiplier(): number {
    return this.openRiftModifierActive() ? OPEN_RIFT_MODIFIER_FRACTION : 1;
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
   * Desktop mechanic, settled by Oded 13:38 (verbatim): "click on the rift
   * once we have anogh energy (the enough energy applies to all platforms)
   * would seal the rift with an animation of notes moving from the pointer to
   * the rift." No hold duration on desktop: the notes flight is animation,
   * then the rift seals. Returns false when energy is short or the rift is
   * not sealable; the caller shows "not enough energy" then.
   */
  pcClickRift(riftId: number): boolean {
    const rift = this.rifts.find((candidate) => candidate.id === riftId);
    if (rift == null || rift.state !== 'open') {
      return false;
    }
    if (this.energy < SEAL_ENERGY_REQUIRED) {
      return false;
    }
    this.energy -= DESKTOP_SEAL_COST;
    rift.state = 'sealing';
    rift.sealProgressMs = 0;
    return true;
  }

  /** Advance a desktop notes-flight seal; seals when the flight lands. */
  updateDesktopSeal(riftId: number, dtMs: number): Rift | null {
    const rift = this.rifts.find((candidate) => candidate.id === riftId);
    if (rift == null || rift.state !== 'sealing' || this.beamActive) {
      return null;
    }
    rift.sealProgressMs += dtMs;
    if (rift.sealProgressMs >= DESKTOP_NOTES_FLIGHT_MS) {
      rift.state = 'sealed';
    }
    return rift;
  }
}
