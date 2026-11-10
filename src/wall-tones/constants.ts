/** Provisional pad palette and tones until Unity project review. */
export const WALL_TONE_PADS = [
  { id: 0, name: 'green', color: 0x2ecc71, frequencyHz: 330 },
  { id: 1, name: 'red', color: 0xe74c3c, frequencyHz: 392 },
  { id: 2, name: 'blue', color: 0x3498db, frequencyHz: 587 },
  { id: 3, name: 'yellow', color: 0xf1c40f, frequencyHz: 494 },
] as const;

export type WallTonePadId = (typeof WALL_TONE_PADS)[number]['id'];

export const NOTE_DURATION_S = 0.55;
export const NOTE_GAP_S = 0.28;
/** Extra hold while a pad stays lit during fanfare / pattern playback. */
export const BLINK_HOLD_S = 0.22;
/** Pad lit<->dim cross-fade time constant (seconds); ~95% settled in 3 tau. */
export const PAD_FADE_TAU_S = 0.05;
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
/** Pre-game Wall Tones panel: meters in front of the headset (world-anchored). */
export const PANEL_FOLLOW_DISTANCE_M = 1.55;
/** Panel height offset relative to headset (meters). */
export const PANEL_FOLLOW_Y_OFFSET_M = -0.1;
/** Panel re-anchor slerp/lerp factor per frame at ~72 Hz after look-away. */
export const PANEL_FOLLOW_SLERP = 0.12;
/** Panel scale while in setup (world-anchored). */
export const PANEL_FOLLOW_SCALE = 0.3;
/** Re-snap the setup panel only after looking this many degrees away from it. */
export const PANEL_LOOK_AWAY_DEG = 24;
/** How close (meters) the panel must get to the target before a look-away snap finishes. */
export const PANEL_SNAP_ARRIVE_M = 0.04;
/** In-game HUD distance when first parked in front of the player. */
export const PANEL_PLAY_DISTANCE_M = 1.4;
/** In-game HUD scale. */
export const PANEL_PLAY_SCALE = 0.28;
/** Backlog 21: head-locked MR subtitle distance from the headset (meters). */
export const HEAD_CAPTION_DISTANCE_M = 1.2;
/** Backlog 21: how far below eye level the MR subtitle rides (meters). */
export const HEAD_CAPTION_DOWN_M = 0.4;
/** Backlog 21: head-locked MR subtitle panel scale. */
export const HEAD_CAPTION_SCALE = 0.3;
/** Simon-style startup: silence between the four-pad sweep and the green encore. */
export const SIMON_FANFARE_MID_PAUSE_S = 0.5;
/** Simon-style startup: silence after the encore before voice / first note. */
export const SIMON_FANFARE_END_PAUSE_S = 0.65;
/** Times the first pad repeats in the startup fanfare. */
export const SIMON_FANFARE_FIRST_PAD_REPEATS = 4;

/** Startup fanfare pad order: green, red, yellow, blue. */
export const SIMON_FANFARE_PAD_ORDER: readonly number[] = [0, 1, 3, 2];
/** If a blinking pad is outside this view cone (degrees from look), show a cue arrow. */
export const BLINK_CUE_OFFSCREEN_DEG = 28;
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
/** Phone flat: smaller pads so a centered 2×2 fits a portrait frame. */
export const PHONE_PAD_SIZE_M = 0.3;
export const PHONE_PAD_GAP_M = 0.1;
export const PHONE_GRID_DISTANCE_M = 1.55;
/** Drop the phone pad grid into the lower half of the view. */
export const PHONE_GRID_VERTICAL_M = -0.42;
/**
 * Phone HUD: high in the portrait frame and closer than the pad grid so the
 * card stays readable and in front if anything still overlaps.
 */
export const PHONE_PANEL_FLAT = {
  // Near full screen width on a portrait phone with larger text (user
  // feedback November 7); raised slightly to keep the pad grid clear below.
  position: [0, 1.8, -0.72] as const,
  scale: 0.226,
} as const;
export const PAD_GAP_M = 0.25;
/** Offset from the tracked hand/grip — not from the headset (0.35 at the face was unusable). */
export const AIR_GHOST_HAND_OFFSET_M = 0.32;
/** Keep the ghost pad center at least this far from the eyes. */
export const AIR_GHOST_MIN_HEAD_DISTANCE_M = 0.7;
export const AIR_PLACE_SITTING_PAD_SIZE_M = 0.36;
export const AIR_PLACE_ROOM_PAD_SIZE_M = 0.55;
/** Mid-size table pads tried before the smallest fallback. */
export const TABLE_PAD_MID_SIZE_M = 0.25;
/** Smaller table pads used when four default pads cannot fit on one table. */
export const TABLE_PAD_FALLBACK_SIZE_M = 0.2;
/** Table pad sizes tried in order; the first size that fits four on one table wins. */
export const TABLE_PAD_SIZE_LADDER_M = [
  AIR_PLACE_SITTING_PAD_SIZE_M,
  TABLE_PAD_MID_SIZE_M,
  TABLE_PAD_FALLBACK_SIZE_M,
];
export const SCAN_WAIT_S = 3;
export const WRONG_RESET_DELAY_S = 0.9;
/** Silence after the start intro finishes, before the first pad tone. */
export const POST_INTRO_DELAY_S = 0.85;
/** Short beat after a successful round before the next sequence plays. */
export const BETWEEN_ROUNDS_DELAY_S = 0.55;
/** Replay the pattern if the player stays idle this long during input. */
export const IDLE_REPLAY_S = 15;
