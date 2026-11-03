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
export const TOUCH_BOX_DEPTH_M = 0.35;
/** Extra hit slop for fingertip tests in MR (fraction of pad size). */
export const TOUCH_SLOP_SCALE = 1.35;
export const HEADSET_PAD_SIZE_M = 1;
export const DESKTOP_PAD_SIZE_M = 0.42;
export const DESKTOP_PAD_GAP_M = 0.18;
export const DESKTOP_GRID_DISTANCE_M = 1.45;
export const PAD_GAP_M = 0.25;
/** Offset from the tracked hand/grip — not from the headset (0.35 at the face was unusable). */
export const AIR_GHOST_HAND_OFFSET_M = 0.32;
/** Keep the ghost pad center at least this far from the eyes. */
export const AIR_GHOST_MIN_HEAD_DISTANCE_M = 0.7;
export const AIR_PLACE_SITTING_PAD_SIZE_M = 0.36;
export const AIR_PLACE_ROOM_PAD_SIZE_M = 0.55;
export const SCAN_WAIT_S = 3;
export const WRONG_RESET_DELAY_S = 0.9;
/** Silence after the start intro finishes, before the first pad tone. */
export const POST_INTRO_DELAY_S = 0.85;
/** Short beat after a successful round before the next sequence plays. */
export const BETWEEN_ROUNDS_DELAY_S = 0.55;
/** Replay the pattern if the player stays idle this long during input. */
export const IDLE_REPLAY_S = 15;
