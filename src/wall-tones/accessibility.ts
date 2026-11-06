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
export function setColorNames(value: boolean): void {
  sessionValues.set(COLOR_NAMES_KEY, value);
  try { localStorage.setItem(COLOR_NAMES_KEY, String(value)); } catch { /* session may be private */ }
  window.dispatchEvent(new Event('wall-tones-accessibility-change'));
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
