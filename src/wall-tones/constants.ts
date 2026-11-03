/** Provisional pad palette and tones until Unity project review. */
export const WALL_TONE_PADS = [
  { id: 0, name: 'green', color: 0x2ecc71, frequencyHz: 392 },
  { id: 1, name: 'red', color: 0xe74c3c, frequencyHz: 330 },
  { id: 2, name: 'blue', color: 0x3498db, frequencyHz: 494 },
  { id: 3, name: 'yellow', color: 0xf1c40f, frequencyHz: 587 },
] as const;

export type WallTonePadId = (typeof WALL_TONE_PADS)[number]['id'];

export const NOTE_DURATION_S = 0.45;
export const NOTE_GAP_S = 0.15;
export const TOUCH_BOX_DEPTH_M = 0.2;
export const HEADSET_PAD_SIZE_M = 1;
export const DESKTOP_PAD_SIZE_M = 0.45;
export const PAD_GAP_M = 0.25;
export const AIR_GHOST_DISTANCE_M = 0.35;
export const SCAN_WAIT_S = 3;
export const WRONG_RESET_DELAY_S = 0.9;
