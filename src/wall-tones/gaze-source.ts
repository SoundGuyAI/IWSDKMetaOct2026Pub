/**
 * Backlog 77+79 native eye-gaze mode: accurate identification of what the
 * headset actually supplies. Quest Browser can hand WebXR a "gaze" input
 * source that is really head direction, so source presence alone proves
 * nothing. The real test (same one IWSDK's gaze diagnostics describe) is
 * whether the gaze ray ever separates from the head ray: eye tracking moves
 * without the head, a head-directed stand-in never does.
 */

export type GazeSourceStatus =
  | 'checking' // native mode on, no verdict yet
  | 'no-session' // not in an XR session
  | 'unavailable' // session has no gaze input source at all
  | 'head-directed' // gaze source exists but never leaves the head ray
  | 'tracked'; // gaze ray separates from the head ray: real eye tracking

export const GAZE_SOURCE_EVENT = 'wall-tones-gaze-source-change';

/** Angle (degrees) beyond which the gaze ray clearly left the head ray. */
export const GAZE_SEPARATION_DEG = 2;
/**
 * How long to watch before calling a never-separating source head-directed.
 * Long enough for the player to glance around at least once.
 */
export const GAZE_HEAD_DIRECTED_AFTER_S = 8;

export function classifyGazeSource(
  hasGazeInputSource: boolean,
  inSession: boolean,
  maxSeparationDeg: number,
  elapsedSeconds: number,
): GazeSourceStatus {
  if (!inSession) return 'no-session';
  if (!hasGazeInputSource) return 'unavailable';
  if (maxSeparationDeg >= GAZE_SEPARATION_DEG) return 'tracked';
  if (elapsedSeconds >= GAZE_HEAD_DIRECTED_AFTER_S) return 'head-directed';
  return 'checking';
}

export function gazeSourceStatusText(status: GazeSourceStatus): string {
  switch (status) {
    case 'tracked':
      return 'Eye tracking: active';
    case 'head-directed':
      return 'Eye tracking: unavailable - headset supplies head direction only';
    case 'unavailable':
      return 'Eye tracking: unavailable - no gaze input from the headset';
    case 'no-session':
      return 'Eye tracking: unknown - not in VR';
    case 'checking':
      return 'Eye tracking: checking...';
  }
}
