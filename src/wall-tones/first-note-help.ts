/** Short-lived coaching state. Never persisted or mixed with instruction memory. */
export class FirstNoteHelp {
  private misses = 0;
  private introDemoShown = false;
  wrong(inputStep: number): boolean {
    if (inputStep !== 0) return false;
    this.misses += 1;
    if (this.misses === 3) this.introDemoShown = false;
    return this.misses === 2;
  }
  correct(inputStep: number): void {
    if (inputStep === 0) { this.misses = 0; this.introDemoShown = false; }
  }
  needsIntroDemo(patternLength: number): boolean {
    return this.misses === 3 && patternLength === 1 && !this.introDemoShown;
  }
  takeIntroDemo(patternLength: number): boolean {
    if (!this.needsIntroDemo(patternLength)) return false;
    this.introDemoShown = true;
    return true;
  }
  needsColorCue(): boolean { return this.misses >= 4; }
}

export const FIRST_NOTE_GUIDANCE = "Wait until the opening pattern finishes. Then press the color that lights up. Let's try again.";
export const FIRST_NOTE_COLORS = ['green', 'red', 'blue', 'yellow'] as const;
export const FIRST_NOTE_INTRO = "Watch and listen. This opening pattern is just the intro. You don't need to copy it.";
export const FIRST_NOTE_SINGLE = 'And now comes the single note you need to press.';
export type FirstNoteHelpClip = 'intro-demo' | 'single-note' | 'guidance' | `press-${typeof FIRST_NOTE_COLORS[number]}`;
export function firstNoteColorClip(padId: number): FirstNoteHelpClip | undefined {
  const color = FIRST_NOTE_COLORS[padId];
  return color == null ? undefined : `press-${color}`;
}
export function firstNoteHelpText(clip: FirstNoteHelpClip): string {
  if (clip === 'intro-demo') return FIRST_NOTE_INTRO;
  if (clip === 'single-note') return FIRST_NOTE_SINGLE;
  return clip === 'guidance' ? FIRST_NOTE_GUIDANCE : `Press ${clip.slice(6)}.`;
}
