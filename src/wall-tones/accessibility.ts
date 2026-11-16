/** Local accessibility preferences. Both features are opt-in, independent. */
const SUBTITLES_KEY = 'wall-tones-hearing-subtitles';
const COLOR_NAMES_KEY = 'wall-tones-color-names';
const sessionValues = new Map<string, boolean>();
function read(key: string): boolean {
  if (sessionValues.has(key)) return sessionValues.get(key)!;
  try { return globalThis.localStorage?.getItem(key) === 'true'; } catch { return false; }
}
export function hearingSubtitlesEnabled(): boolean { return read(SUBTITLES_KEY); }
export function colorNamesEnabled(): boolean { return read(COLOR_NAMES_KEY); }
export function setHearingSubtitles(value: boolean): void {
  sessionValues.set(SUBTITLES_KEY, value);
  try { localStorage.setItem(SUBTITLES_KEY, String(value)); } catch { /* session may be private */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
}
const VOICES_OFF_KEY = 'wall-tones-voices-off';
export function voicesOffEnabled(): boolean { return read(VOICES_OFF_KEY); }
export function setVoicesOff(value: boolean): void {
  sessionValues.set(VOICES_OFF_KEY, value);
  try { localStorage.setItem(VOICES_OFF_KEY, String(value)); } catch { /* session may be private */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
}
export function setColorNames(value: boolean): void {
  sessionValues.set(COLOR_NAMES_KEY, value);
  try { localStorage.setItem(COLOR_NAMES_KEY, String(value)); } catch { /* session may be private */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
}

/**
 * Backlog 79: "Head gaze + pinch" pad presses (head-forward ray committed by
 * a pinch from either hand). Optional since 2026-11-15; default OFF per Oded
 * (2026-11-15 02:34): looking at a pad plus any pinch can fire it, so players
 * opt in via Settings > Accessibility. Hand-ray and fingertip input are
 * unaffected.
 */
const GAZE_PINCH_KEY = 'wall-tones-head-gaze-pinch';
const GAZE_PINCH_DEFAULT = false;

/**
 * Backlog 77+79 (extended 2026-11-15 02:36): the gaze + pinch input is a
 * single choice between three explicit modes - off, the custom head-forward
 * ray ("head"), and the IWSDK native eye-gaze pipeline ("native",
 * experimental). Default OFF. The native mode never silently replaces or
 * falls back to the head path: the player picks one in Settings, and when
 * the headset supplies no real eye-gaze source the game says so instead of
 * pretending (see gaze-source.ts).
 */
export type GazePinchMode = 'off' | 'head' | 'native';
const GAZE_PINCH_MODE_KEY = 'wall-tones-gaze-pinch-mode';
const GAZE_PINCH_MODES: readonly GazePinchMode[] = ['off', 'head', 'native'];
const sessionModeValues = new Map<string, GazePinchMode>();

export function headGazePinchEnabled(): boolean {
  return gazePinchMode() === 'head';
}
export function nativeGazePinchEnabled(): boolean {
  return gazePinchMode() === 'native';
}
export function gazePinchMode(): GazePinchMode {
  if (sessionModeValues.has(GAZE_PINCH_MODE_KEY)) return sessionModeValues.get(GAZE_PINCH_MODE_KEY)!;
  try {
    const stored = globalThis.localStorage?.getItem(GAZE_PINCH_MODE_KEY);
    if (stored != null && (GAZE_PINCH_MODES as string[]).includes(stored)) return stored as GazePinchMode;
    // Migrate the original boolean toggle (true = head mode).
    const legacy = globalThis.localStorage?.getItem(GAZE_PINCH_KEY);
    if (legacy != null) return legacy === 'true' ? 'head' : 'off';
  } catch { /* session may be private */ }
  if (sessionValues.has(GAZE_PINCH_KEY)) return sessionValues.get(GAZE_PINCH_KEY)! ? 'head' : 'off';
  return GAZE_PINCH_DEFAULT ? 'head' : 'off';
}
export function setGazePinchMode(mode: GazePinchMode): void {
  sessionModeValues.set(GAZE_PINCH_MODE_KEY, mode);
  sessionValues.set(GAZE_PINCH_KEY, mode === 'head');
  try {
    localStorage.setItem(GAZE_PINCH_MODE_KEY, mode);
    localStorage.setItem(GAZE_PINCH_KEY, String(mode === 'head'));
  } catch { /* session may be private */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
}
export function setHeadGazePinch(value: boolean): void {
  setGazePinchMode(value ? 'head' : 'off');
}
export function setNativeGazePinch(value: boolean): void {
  setGazePinchMode(value ? 'native' : 'off');
}
let spokenCaption = '';
let captionToken = 0;
export function currentSpokenCaption(): string { return spokenCaption; }
/** Return an ownership token so old onended callbacks cannot clear a new line. */
export function startSpokenCaption(text: string): number {
  spokenCaption = text;
  return ++captionToken;
}
export function endSpokenCaption(token?: number): void {
  if (token != null && token !== captionToken) return;
  spokenCaption = '';
  captionToken++;
}
