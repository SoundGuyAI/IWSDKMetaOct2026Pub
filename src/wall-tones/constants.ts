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
export const TOUCH_BOX_DEPTH_M = 0.22;
/** Geometry inflate for the invisible touch mesh (keep modest to avoid false hits). */
export const TOUCH_SLOP_SCALE = 1.08;
/** Consecutive frames the tip must stay inside before a press counts. */
export const TOUCH_ENTER_FRAMES = 2;
/** Frames outside before the same pad can fire again. */
export const TOUCH_EXIT_FRAMES = 3;
/** Tip must stay within this of that hand's grip (rejects untracked ghost tips). */
export const TOUCH_TIP_GRIP_MAX_M = 0.24;
/** Extra center-distance budget beyond half the pad face (meters). */
export const TOUCH_CENTER_PAD_MARGIN_M = 0.08;
/** Ghost orientation slerp factor per frame at ~72 Hz (higher = snappier). */
export const AIR_ORIENT_SLERP = 0.16;
/** Palm flatness ≥ this snaps toward horizontal. */
export const AIR_ORIENT_SNAP_FLAT = 0.68;
/** Palm flatness ≤ this snaps toward vertical (band between avoids flicker). */
export const AIR_ORIENT_SNAP_UPRIGHT = 0.42;
export const HEADSET_PAD_SIZE_M = 1;
export const DESKTOP_PAD_SIZE_M = 0.42;
export const DESKTOP_PAD_GAP_M = 0.18;
export const DESKTOP_GRID_DISTANCE_M = 1.45;
/** Shift the flat 2×2 grid left so the side HUD stays fully visible. */
export const DESKTOP_GRID_LATERAL_M = -0.55;
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
