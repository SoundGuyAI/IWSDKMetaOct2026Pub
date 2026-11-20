/**
 * Backlog item 119: short Cypher encouragement clips for early Act 1.
 * One random line every two successful patterns, only after the player has
 * heard Cypher's first contact (the streak-5 window) and only until Act 1
 * finishes; the backstory takes over after that. Session-scoped: the cadence
 * resets with the page, while story position stays in CypherProgress.
 * Skip or interrupt leaves the line unheard (lineCompleted is not reached),
 * so an unheard line retries at the next quiet boundary.
 */
export const CYPHER_ENCOURAGEMENT = [
  { id: 'enc1', text: "Good. They don't suspect anything." },
  { id: 'enc2', text: "Keep going. I'm still here." },
  { id: 'enc3', text: "Steady. We're getting closer." },
  { id: 'enc4', text: "That's it. Keep the rhythm." },
  { id: 'enc5', text: "That's it. They still have no idea." },
  { id: 'enc6', text: 'Again. Just like that.' },
  { id: 'enc7', text: 'Beautiful. They suspect nothing.' },
  { id: 'enc8', text: "Hold the line. I'm watching." },
] as const;

export type EncouragementLineId = (typeof CYPHER_ENCOURAGEMENT)[number]['id'];
export type EncouragementLine = (typeof CYPHER_ENCOURAGEMENT)[number];

export class EncouragementCue {
  private completed = 0;
  private pending: number | undefined;
  private lastPlayed: number | undefined;

  constructor(private readonly random: () => number = Math.random) {}

  /** Called at each completed-pattern boundary where no story window is due. */
  successfulPattern(firstContactHeard: boolean, act1Finished: boolean, narratorQuiet: boolean): EncouragementLine | undefined {
    if (!firstContactHeard || act1Finished) return undefined;
    if (this.pending !== undefined) return narratorQuiet ? CYPHER_ENCOURAGEMENT[this.pending] : undefined;
    this.completed = Math.min(2, this.completed + 1);
    if (this.completed < 2 || !narratorQuiet) return undefined;
    this.completed = 0;
    let index = Math.floor(this.random() * CYPHER_ENCOURAGEMENT.length);
    if (index === this.lastPlayed) index = (index + 1) % CYPHER_ENCOURAGEMENT.length;
    this.pending = index;
    return CYPHER_ENCOURAGEMENT[index];
  }

  lineCompleted(): void {
    if (this.pending === undefined) return;
    this.lastPlayed = this.pending;
    this.pending = undefined;
  }
}
