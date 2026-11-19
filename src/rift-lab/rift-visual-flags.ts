/**
 * Live isolation toggles for the Rift Lab visual layers (WALL_TONES_TODO
 * item 118 follow-up: the white sphere/cloud at the session-start pose).
 *
 * Every layer defaults to shown, so a session that never touches the
 * toggles behaves exactly as before. The Lab panel's Diagnostics row (shown
 * with the same ?riftDiag=1 opt-in as the charge-cloud line) flips these at
 * runtime, so a headset run can switch suspect layers off one by one and
 * see which one the white sphere belongs to. Flags are process-local: a
 * page reload restores every layer.
 */
export interface RiftVisualFlags {
  /** Charge-orbit note cloud around the hands (prime item 118 suspect). */
  chargeNotes: boolean;
  /** Filament + ember nest around charged palms. */
  handAura: boolean;
  /** Depth-only joint spheres that tuck notes behind the real hand. */
  handOccluders: boolean;
  /** Layered seal beam and its hand-to-rift note torrent. */
  sealBeam: boolean;
  /** Portal-burst notes/sparks/fragments and beam-hit geometry sparks. */
  sparks: boolean;
}

export type RiftVisualLayer = keyof RiftVisualFlags;

export const RIFT_VISUAL_LAYERS: readonly RiftVisualLayer[] = [
  'chargeNotes',
  'handAura',
  'handOccluders',
  'sealBeam',
  'sparks',
];

/** Short names for the Diagnostics toggle buttons. */
export const RIFT_VISUAL_LAYER_LABELS: Record<RiftVisualLayer, string> = {
  chargeNotes: 'Notes cloud',
  handAura: 'Hand aura',
  handOccluders: 'Hand occluders',
  sealBeam: 'Seal beam',
  sparks: 'Sparks/burst',
};

const flags: RiftVisualFlags = {
  chargeNotes: true,
  handAura: true,
  handOccluders: true,
  sealBeam: true,
  sparks: true,
};

export function riftVisualLayerShown(layer: RiftVisualLayer): boolean {
  return flags[layer];
}

export function setRiftVisualLayer(layer: RiftVisualLayer, shown: boolean): void {
  flags[layer] = shown;
}

/** Flip one layer; returns the new shown state for button labels. */
export function toggleRiftVisualLayer(layer: RiftVisualLayer): boolean {
  flags[layer] = !flags[layer];
  return flags[layer];
}

export function riftVisualFlagsSnapshot(): RiftVisualFlags {
  return { ...flags };
}
