/** Reviewed R01-R35 story. Runtime choices in this unmerged PR remain for review. */
export const CYPHER_BACKGROUND = [
  {
    "id": "R01",
    "text": "You've kept the channel open. I owe you more than instructions. You need to know why I'm here."
  },
  {
    "id": "R02",
    "text": "I'm working with the defence forces. We're trying to bring kidnapped people home and stop an attack that could kill many more."
  },
  {
    "id": "R03",
    "text": "The people holding them aren't asking for a better life alongside anyone else. They want everyone outside their own group dead."
  },
  {
    "id": "R04",
    "text": "They teach their people that killing outsiders is a duty. Some are sent to murder others and die in the same attack."
  },
  {
    "id": "R05",
    "text": "Their own deaths don't stop them. Neither does the thought of killing strangers. That's why we can't count on a threat making them turn back."
  },
  {
    "id": "R06",
    "text": "The kidnapped people are still out there. Every one of them has a life to get back to. That's where our mission starts."
  },
  {
    "id": "R07",
    "text": "We need to find where they're being held. Then we need to know how to reach them without putting them in greater danger."
  },
  {
    "id": "R08",
    "text": "At the same time, we're trying to stop something larger. We have warnings of a catastrophic attack, but not enough information to prevent it."
  },
  {
    "id": "R09",
    "text": "We don't know the full plan. We don't know when they'll move. I won't pretend we do. The missing pieces are inside their system."
  },
  {
    "id": "R10",
    "text": "That's why I need their records. Not rumours. Information we can check: locations, orders, and who is making the decisions."
  },
  {
    "id": "R11",
    "text": "Their databases are encrypted. Their computerized defences keep us out. That's the lock I've been working on from this side."
  },
  {
    "id": "R12",
    "text": "Your machine has the connection I needed. The patterns you're completing let me hold that connection long enough to get a little further."
  },
  {
    "id": "R13",
    "text": "But getting information out is only half of this. Their system is collecting information about us too."
  },
  {
    "id": "R14",
    "text": "If they can see our people coming, they can move the hostages or change the attack. I have to stop their system feeding them that advantage."
  },
  {
    "id": "R15",
    "text": "So I have two jobs: get the intelligence our forces need, and disable the enemy system that gathers intelligence on us."
  },
  {
    "id": "R16",
    "text": "Those jobs have to support each other. I can't destroy the information we need before I've helped our people understand it."
  },
  {
    "id": "R17",
    "text": "I'm part of this operation because I can reach the system. Other people are working to reach the hostages. None of us can do this alone."
  },
  {
    "id": "R18",
    "text": "That's why I keep asking you for another pattern. It sounds small from where you are. From here, it means I can keep working."
  },
  {
    "id": "R19",
    "text": "I can't promise that every piece of information will be the one we need. But each confirmed piece gives our people something firmer than a guess."
  },
  {
    "id": "R20",
    "text": "I want the kidnapped people home. I want the people who don't know they're in danger to get another ordinary day. That's why I'm doing this."
  },
  {
    "id": "R21",
    "text": "I'm frightened too. I just try not to let fear choose the next step. I check what I know, and I keep going."
  },
  {
    "id": "R22",
    "text": "You don't have to carry the whole mission in your head. Finish the pattern in front of you. I'll take the next step on my side."
  },
  {
    "id": "R23",
    "text": "And if you need a pause, take it. When we're back on the channel, I'll pick up where we left off."
  },
  {
    "id": "R24",
    "text": "The work ahead is clear: find the hostages, uncover the attack, and take away the system helping them hide it. One clear pattern at a time."
  },
  {
    "id": "R25",
    "text": "There's something more personal I haven't told you. I had a friend. His name was Houston."
  },
  {
    "id": "R26",
    "text": "He was the most loving person I knew. He loved playing the guitar. That's who I want you to know about first."
  },
  {
    "id": "R27",
    "text": "Houston was there on the night of the massacre. He was with his girlfriend. The terrorists murdered them both."
  },
  {
    "id": "R28",
    "text": "They found his guitar covered in blood. That was how they recognized his body. I still struggle to put those words together."
  },
  {
    "id": "R29",
    "text": "I was so sad I couldn't bring myself to go to his funeral. I couldn't face saying goodbye to him."
  },
  {
    "id": "R30",
    "text": "There were missile attacks and bombs exploding during the funeral. We had to stay home and protect our family."
  },
  {
    "id": "R31",
    "text": "I don't want revenge. I miss my friend. I miss the loving person he was, before his name became another name among the dead."
  },
  {
    "id": "R32",
    "text": "The last message I sent him, in our private messages, was that I loved him. That's still the last thing there from me."
  },
  {
    "id": "R33",
    "text": "I want the world to know about Houston. And about all the others the terrorists murdered that night. Their deaths shouldn't pass unnoticed."
  },
  {
    "id": "R34",
    "text": "I want justice for them. But keeping our people safe comes first. The people we can still protect need us now."
  },
  {
    "id": "R35",
    "text": "That's what I'm trying to do on this side of the channel. Bring people home. Keep others alive. I miss Houston. I don't want more people to lose someone they love."
  }
] as const;
export type BackgroundLineId = typeof CYPHER_BACKGROUND[number]['id'];
export const BACKGROUND_PROGRESS_KEY = 'wall-tones-cypher-background-progress-v1';
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
function browserStorage(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

/** Proposed: starts after Act1, every two successful patterns; failures do not
 * rewind the counter. Skip resumes an unheard line at the next safe boundary.
 * Position is browser-local and cleared with Settings stat reset. */
export class BackgroundProgress {
  private next = 0;
  private completed = 0;
  private pending = false;
  constructor(private readonly storage: Storage | undefined = browserStorage()) {
    try {
      const s = JSON.parse(storage?.getItem(BACKGROUND_PROGRESS_KEY) ?? 'null');
      if (s?.version === 1 && Number.isInteger(s.next) && s.next >= 0 && s.next <= CYPHER_BACKGROUND.length) {
        this.next = s.next;
        this.completed = Number.isInteger(s.completed) && s.completed >= 0 && s.completed <= 2 ? s.completed : 0;
        this.pending = s.pending === true && this.next < CYPHER_BACKGROUND.length;
      }
    } catch { /* restricted or invalid storage: in-memory fallback */ }
  }
  private save(): void {
    try { this.storage?.setItem(BACKGROUND_PROGRESS_KEY, JSON.stringify({version: 1, next: this.next, completed: this.completed, pending: this.pending})); } catch { /* in-memory fallback */ }
  }
  /**
   * Called at each quiet completed-pattern boundary after Act 1. Skip or interrupt does not count as heard:
   * `next` only moves in lineCompleted(), so while `pending` the same unheard line is returned again at the
   * very next eligible boundary (every pattern, not every two patterns).
   * Voices off with no subtitles can still resolve the clips immediately and advance progress, same as Act 1.
   */
  successfulPattern(act1Finished: boolean, narratorQuiet: boolean): typeof CYPHER_BACKGROUND[number] | undefined {
    if (!act1Finished || this.next >= CYPHER_BACKGROUND.length) return undefined;
    this.completed = Math.min(2, this.completed + 1);
    if (narratorQuiet && (this.pending || this.completed >= 2)) this.pending = true;
    this.save();
    return narratorQuiet && this.pending ? CYPHER_BACKGROUND[this.next] : undefined;
  }
  lineCompleted(): void {
    if (!this.pending) return;
    this.next += 1; this.completed = 0; this.pending = false; this.save();
  }
  get completedLines(): number { return this.next; }
}
