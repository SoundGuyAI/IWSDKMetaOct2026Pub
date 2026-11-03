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
/** Inner press slab depth (meters) — short so a poke registers near the face. */
export const TOUCH_PRESS_DEPTH_M = 0.14;
/** Outer proximity / hover volume depth (meters). */
export const TOUCH_HOVER_DEPTH_M = 0.34;
/** Legacy alias used by older helpers; matches press depth. */
export const TOUCH_BOX_DEPTH_M = TOUCH_PRESS_DEPTH_M;
/** Inner press face inflate (1 = pad face size). */
export const TOUCH_PRESS_SCALE = 1.02;
/** Outer hover face inflate — wider so you see proximity before a press. */
export const TOUCH_HOVER_SCALE = 1.42;
/** @deprecated Prefer TOUCH_PRESS_SCALE. */
export const TOUCH_SLOP_SCALE = TOUCH_PRESS_SCALE;
/** Consecutive frames inside the press volume before a press counts. */
export const TOUCH_ENTER_FRAMES = 2;
/** Frames outside the press volume before the pad re-arms. */
export const TOUCH_EXIT_FRAMES = 2;
/** After a press, ignore re-entry until this cooldown elapses (seconds). */
export const TOUCH_PRESS_COOLDOWN_S = 0.4;
/** Tip must stay within this of that hand's grip (rejects untracked ghost tips). */
export const TOUCH_TIP_GRIP_MAX_M = 0.24;
/** Extra center-distance budget for the outer hover volume (meters). */
export const TOUCH_HOVER_CENTER_MARGIN_M = 0.16;
/** Extra center-distance budget for the inner press volume (meters). */
export const TOUCH_PRESS_CENTER_MARGIN_M = 0.04;
/** @deprecated Prefer TOUCH_PRESS_CENTER_MARGIN_M. */
export const TOUCH_CENTER_PAD_MARGIN_M = TOUCH_PRESS_CENTER_MARGIN_M;
/** Pre-game Wall Tones panel: meters in front of the headset. */
export const PANEL_FOLLOW_DISTANCE_M = 1.15;
/** Panel height offset relative to headset (meters). */
export const PANEL_FOLLOW_Y_OFFSET_M = -0.12;
/** Panel follow slerp/lerp factor per frame at ~72 Hz. */
export const PANEL_FOLLOW_SLERP = 0.14;
/** Panel scale while following the headset during setup. */
export const PANEL_FOLLOW_SCALE = 0.3;
/** Ghost orientation slerp factor per frame at ~72 Hz (higher = snappier). */
export const AIR_ORIENT_SLERP = 0.16;
/**
 * Grip local +Y tends to follow the hand's long axis on Quest grips/hands.
 * High |world Y| ⇒ hand held upright ⇒ wall pad; low ⇒ hand flattened ⇒ table pad.
 */
export const AIR_ORIENT_SNAP_UPRIGHT = 0.68;
/** |gripUp.y| ≤ this snaps toward horizontal (band between avoids flicker). */
export const AIR_ORIENT_SNAP_FLAT = 0.42;
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
