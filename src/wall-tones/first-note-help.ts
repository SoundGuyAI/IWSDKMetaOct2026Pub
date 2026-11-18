/** Short-lived coaching state. Never persisted or mixed with instruction memory. */
export class FirstNoteHelp {
  private misses = 0;
  wrong(inputStep: number): boolean {
    if (inputStep !== 0) return false;
    this.misses += 1;
    return this.misses === 3;
  }
  correct(inputStep: number): void {
    if (inputStep === 0) this.misses = 0;
  }
  needsColorCue(): boolean { return this.misses >= 4; }
}

export const FIRST_NOTE_GUIDANCE = "Wait until the opening pattern finishes. Then press the color that lights up. Let's try again.";
export const FIRST_NOTE_COLORS = ['green', 'red', 'blue', 'yellow'] as const;
export type FirstNoteHelpClip = 'guidance' | `press-${typeof FIRST_NOTE_COLORS[number]}`;
export function firstNoteColorClip(padId: number): FirstNoteHelpClip | undefined {
  const color = FIRST_NOTE_COLORS[padId];
  return color == null ? undefined : `press-${color}`;
}
export function firstNoteHelpText(clip: FirstNoteHelpClip): string {
  return clip === 'guidance' ? FIRST_NOTE_GUIDANCE : `Press ${clip.slice(6)}.`;
}
