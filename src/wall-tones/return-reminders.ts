import type { InstructionSection, InstructionStorage } from './instruction-memory.js';

export const RETURN_VISIT_KEY = 'wall-tones-return-visit-v1';
export type ReminderAnswer = 'yes' | 'no' | null;
export type ReturnCypherLine = 'C-R01' | 'C-R02' | 'C-R03' | 'C-R04' | 'C-R05' | 'C-R06';
export interface ReturnStage {
  /** Fully completed story windows only, not a taken/partly-spoken window. */
  completedWindowIds: readonly string[];
  storyFinished: boolean;
  /** Absent until the actual gameplay encounter supplies persisted state. */
  rifts?: 'active' | 'sealed';
}

/** One reminder matching saved state. Never infer encounter state from streak. */
export function returnCypherLine(stage: ReturnStage): ReturnCypherLine | undefined {
  // Returning is not an introduction. Only actual completed streak-5 story
  // progress can unlock Cypher, including every later-stage reminder.
  if (!stage.completedWindowIds.includes('connection')) return undefined;
  if (stage.rifts === 'active') return 'C-R04';
  if (stage.rifts === 'sealed') return stage.storyFinished ? 'C-R06' : 'C-R05';
  if (stage.storyFinished) return 'C-R06';
  if (stage.completedWindowIds.includes('codename')) return 'C-R03';
  if (stage.completedWindowIds.includes('connection')) return 'C-R02';
  return 'C-R01';
}

export const REMINDER_QUESTION = {
  gameplay: 'N-R02', store: 'N-R05', achievements: 'N-R06',
} as const;

export function reminderTutorial(section: InstructionSection, platform: 'flat' | 'phone' | 'mr'): string {
  if (section === 'store') return 'storeIntro';
  if (section === 'achievements') return platform === 'mr' ? 'achvIntroMr' : platform === 'phone' ? 'achvIntroIphone' : 'achvIntroPc';
  return platform === 'mr' ? 'howToPlayMr' : 'howToPlay';
}

/** Lifetime = one loaded game page. New Run does not replace this object.
 * Construct/enter only for actual game entry, not loading, Settings or the Lab. */
export class ReturnReminderSession {
  readonly returning: boolean;
  private readonly offered = new Set<InstructionSection>();
  private readonly eligibleAtFirstEntry = new Map<InstructionSection, boolean>();
  private welcomeTaken = false;
  constructor(storage: InstructionStorage | undefined) {
    let returning = false;
    try {
      returning = storage?.getItem(RETURN_VISIT_KEY) === '1';
      storage?.setItem(RETURN_VISIT_KEY, '1');
    } catch { /* no saved evidence: never invent a returning player */ }
    this.returning = returning;
  }
  takeWelcome(): boolean {
    if (!this.returning || this.welcomeTaken) return false;
    this.welcomeTaken = true;
    return true;
  }
  /** Claim at the safe context boundary, not while a pattern or another prompt runs. */
  takeOffer(section: InstructionSection, originalTutorialHeard: boolean, safe: boolean): boolean {
    if (!this.eligibleAtFirstEntry.has(section)) this.eligibleAtFirstEntry.set(section, originalTutorialHeard);
    if (!this.returning || !this.eligibleAtFirstEntry.get(section) || !originalTutorialHeard || !safe || this.offered.has(section)) return false;
    this.offered.add(section);
    return true;
  }
  /** This policy never clears heard memory. No answer is a quiet dismissal. */
  shouldReplay(answer: ReminderAnswer): boolean { return answer === 'yes'; }
}

let loadedPageSession: ReturnReminderSession | undefined;
/** Reuse through in-page hub/immersive world swaps; a browser reload recreates it. */
export function returnReminderSession(): ReturnReminderSession {
  if (!loadedPageSession) {
    let storage: InstructionStorage | undefined;
    try { storage = globalThis.localStorage; } catch { /* unavailable */ }
    loadedPageSession = new ReturnReminderSession(storage);
  }
  return loadedPageSession;
}
