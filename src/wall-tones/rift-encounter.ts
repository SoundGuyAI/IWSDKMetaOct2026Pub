import type { PadColorName } from '../rift-lab/rift-energy.js';

/**
 * Three-portal Rift encounter in main gameplay (owner-settled November 18,
 * each parameter from his verbatim answers, not Lab defaults):
 *
 * - Arms at a run streak of 15 (the seam window; "let's keep 15").
 * - Three portals spawn ONE BY ONE and may accumulate: the next one
 *   arrives on time even if earlier ones are still open. Pacing revised
 *   after his Nov 19 desktop playtest: the first portal waits 12 s so the
 *   seam window's how-to line (C16B) lands before anything appears, later
 *   portals arrive 20 s apart ("let them wait a little longer"), and a
 *   sealed portal never respawns in this stage ("we will come back to the
 *   rifts again before act 2").
 * - Portals prefer the wall in front of the player (the pads' wall) when
 *   possible; placement falls back to the renderer's normal wall rules.
 * - Sealing is possible ANY TIME the player has enough energy.
 * - Energy: +10 per correct note entered manually, by Play or by AutoPlay;
 *   wrong notes and the Listen demonstration never charge. Energy is only
 *   collected while at least one portal is open. Seal cost 120, cap 240
 *   (the shared RiftLabGame enforces both).
 * - While at least one portal is open, score AND Bars carry a single x0.5
 *   factor ("Yes both"); energy earning is not halved.
 * - Misses keep energy, open portals and seal progress; only New Run resets
 *   the encounter. A page reload is a fresh run: the encounter re-arms at
 *   streak 15 (an earlier return after reload is a deferred follow-up).
 * - The Cypher story cannot progress past the encounter until all three
 *   portals are sealed; the third seal plays her acknowledgement line.
 *
 * This controller is the single source of encounter truth shared by
 * WallTonesSystem (note/streak/story hooks) and RiftLabSystem (portal
 * rendering, sealing input, energy visuals). Only the resolved flag and a
 * pending acknowledgement persist across reloads; live encounter state is
 * run-scoped by design.
 */

export const RIFT_STREAK_GATE = 15;
export const RIFT_PORTAL_COUNT = 3;
export const RIFT_FIRST_SPAWN_DELAY_MS = 12_000;
export const RIFT_SPAWN_INTERVAL_MS = 20_000;
export const RIFT_SPAWN_RETRY_MS = 2_000;
export const RIFT_OPEN_SCORE_FACTOR = 0.5;
export const RIFT_ACK_LINE_ID = 'C24' as const;

const STORAGE_KEY = 'wall-tones-rift-encounter-v1';

interface EncounterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): EncounterStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export type RiftNoteSource = 'manual' | 'play' | 'autoplay';

export class RiftEncounter {
  private resolved = false;
  private ackPending = false;
  private active = false;
  private spawnIndex = 0;
  private nextSpawnAt = Number.POSITIVE_INFINITY;
  private sealedCount = 0;
  /** Open/opening portals, synced every frame by the rift renderer. */
  private openRifts = 0;
  private readonly chargeQueue: PadColorName[] = [];
  private clearRequested = false;
  private preferredWall: { x: number; y: number; z: number } | null = null;

  constructor(
    private readonly storage: EncounterStorage | undefined = browserStorage(),
    private readonly now: () => number = () => performance.now(),
  ) {
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.version === 1) {
        this.resolved = saved.resolved === true;
        this.ackPending = saved.ackPending === true;
      }
    } catch {
      // Invalid/private storage: unresolved, never blocking play.
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          resolved: this.resolved,
          ackPending: this.ackPending,
        }),
      );
    } catch {
      // Private mode: session state still works.
    }
  }

  get isResolved(): boolean {
    return this.resolved;
  }

  /** Renderer gate: portals/energy visuals live only while this holds. */
  encounterActive(): boolean {
    return this.active && !this.resolved;
  }

  /** Story gate: no gated Cypher window may start until all three sealed. */
  storyGateActive(): boolean {
    return this.active && !this.resolved;
  }

  /** Score/Bars factor: a single x0.5 while at least one portal is open. */
  scoreFactor(): number {
    return this.encounterActive() && this.openRifts > 0
      ? RIFT_OPEN_SCORE_FACTOR
      : 1;
  }

  /** The seam window's words open the encounter (portals with the lines). */
  noteSeamWindowStarted(): void {
    this.begin();
  }

  /**
   * Re-arm path: the seam window is already consumed (a later run or a
   * reload), so a streak of 15 brings the encounter back on its own.
   */
  ensureArmedForStreak(streak: number, storyPastSeam: boolean): void {
    if (storyPastSeam && streak >= RIFT_STREAK_GATE) this.begin();
  }

  private begin(): void {
    if (this.resolved || this.active) return;
    this.active = true;
    this.spawnIndex = 0;
    this.sealedCount = 0;
    this.nextSpawnAt = this.now() + RIFT_FIRST_SPAWN_DELAY_MS;
  }

  /**
   * Spawn schedule: one portal when due, up to three total, twenty seconds
   * apart. Sealed portals never respawn: three spawns per encounter, ever. The renderer calls failLastSpawn when no safe spot exists yet,
   * which re-arms the same portal for a near retry without skipping it.
   */
  consumeDueSpawn(): boolean {
    if (!this.encounterActive()) return false;
    if (this.spawnIndex >= RIFT_PORTAL_COUNT) return false;
    if (this.now() < this.nextSpawnAt) return false;
    this.spawnIndex += 1;
    this.nextSpawnAt =
      this.spawnIndex < RIFT_PORTAL_COUNT
        ? this.now() + RIFT_SPAWN_INTERVAL_MS
        : Number.POSITIVE_INFINITY;
    return true;
  }

  failLastSpawn(retryMs: number = RIFT_SPAWN_RETRY_MS): void {
    if (!this.encounterActive() || this.spawnIndex <= 0) return;
    this.spawnIndex -= 1;
    this.nextSpawnAt = this.now() + retryMs;
  }

  /**
   * Charging rule: correct manual, Play and AutoPlay notes only, and only
   * collected while at least one portal is open. Returns whether the note
   * charged (wrong notes and Listen playback never reach this method).
   */
  noteScored(color: PadColorName, _source: RiftNoteSource): boolean {
    if (!this.encounterActive() || this.openRifts < 1) return false;
    this.chargeQueue.push(color);
    return true;
  }

  consumeCharge(): PadColorName | null {
    return this.chargeQueue.shift() ?? null;
  }

  /** Frame sync from the renderer: how many portals are open/opening. */
  setOpenRifts(count: number): void {
    this.openRifts = count;
  }

  /** Renderer reports freshly sealed portals; the third resolves. */
  noteSealed(count: number): void {
    if (!this.encounterActive() || count <= 0) return;
    this.sealedCount += count;
    if (this.sealedCount >= RIFT_PORTAL_COUNT) {
      this.resolved = true;
      this.active = false;
      this.ackPending = true;
      this.save();
    }
  }

  /** Cypher's third-seal acknowledgement, taken once it can play. */
  takePendingAck(): typeof RIFT_ACK_LINE_ID | null {
    if (!this.ackPending) return null;
    this.ackPending = false;
    this.save();
    return RIFT_ACK_LINE_ID;
  }

  /**
   * New Run resets the encounter (his "reset them only on New Run"):
   * energy, open portals, spawn schedule and seal count all restart, and the
   * encounter re-arms at streak 15. Misses never call this. A resolved
   * encounter stays resolved.
   */
  onNewRun(): void {
    if (this.resolved) return;
    this.active = false;
    this.spawnIndex = 0;
    this.nextSpawnAt = Number.POSITIVE_INFINITY;
    this.sealedCount = 0;
    this.openRifts = 0;
    this.chargeQueue.length = 0;
    this.clearRequested = true;
  }

  /** The renderer asks for a full scene clear after onNewRun. */
  consumeClearRequested(): boolean {
    const requested = this.clearRequested;
    this.clearRequested = false;
    return requested;
  }

  /**
   * The rift renderer was torn down (mode change) mid-encounter: live
   * portals and charge are gone, so the encounter restarts from its arming
   * rule rather than stranding a half-spawned schedule. Resolve survives.
   */
  onDriveLost(): void {
    if (this.resolved) return;
    this.active = false;
    this.spawnIndex = 0;
    this.nextSpawnAt = Number.POSITIVE_INFINITY;
    this.sealedCount = 0;
    this.openRifts = 0;
    this.chargeQueue.length = 0;
  }

  /** Pads' wall centroid: portals prefer the wall in front of the player. */
  setPreferredWallPosition(position: { x: number; y: number; z: number }): void {
    this.preferredWall = { ...position };
  }

  getPreferredWallPosition(): { x: number; y: number; z: number } | null {
    return this.preferredWall;
  }
}

/** Shared singleton: both game systems import this one instance. */
export const riftEncounter = new RiftEncounter();
