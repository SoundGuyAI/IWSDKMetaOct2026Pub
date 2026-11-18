/** Persistent tutorial memory. Does not change score, purchases or story progress. */
export const INSTRUCTION_MEMORY_KEY = 'wall-tones-instructions-v1';
export type InstructionSection = 'gameplay' | 'store' | 'achievements';
export interface InstructionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

/** State-dependent setup directions, praise, feedback and story are deliberately
 * excluded. They describe the current situation, not a reusable tutorial. */
const SECTION_BY_CLIP: Readonly<Record<string, InstructionSection>> = {
  howToPlay: 'gameplay', howToPlayMr: 'gameplay', howToPlayRest: 'gameplay',
  pointAndPress: 'gameplay', pointAndPressMr: 'gameplay',
  barsFirstEarn: 'gameplay', palmProjector: 'gameplay', gameoverGestures: 'gameplay',
  storeWelcome: 'store', storeHints: 'store', storeIntro: 'store',
  storeItemListen: 'store', storeItemHint: 'store', storeItemPlay: 'store',
  storeItemAutoplay: 'store', storeItemIndex: 'store', storeItemReplay: 'store',
  storeItemSaver: 'store', storeItemSecret: 'store', storeItemHack: 'store',
  achvStreak: 'achievements', achvBars: 'achievements', achvScore: 'achievements',
  achvStore: 'achievements', achvPresses: 'achievements', achvMovement: 'achievements',
  achvIntroPc: 'achievements', achvIntroIphone: 'achievements', achvIntroMr: 'achievements',
};
export function instructionSection(clip: string): InstructionSection | undefined { return SECTION_BY_CLIP[clip]; }
function instructionBrowserStorage(): InstructionStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
export class InstructionMemory {
  private heard = new Set<string>();
  constructor(private readonly storage: InstructionStorage | undefined = instructionBrowserStorage()) {
    try {
      const saved = JSON.parse(storage?.getItem(INSTRUCTION_MEMORY_KEY) ?? 'null');
      if (saved?.version === 1 && Array.isArray(saved.heard)) {
        this.heard = new Set(saved.heard.filter((id: unknown): id is string => typeof id === 'string' && instructionSection(id) !== undefined));
      }
    } catch { /* invalid/private storage: session memory remains available */ }
  }
  hasHeard(clip: string): boolean {
    if (this.heard.has(clip)) return true;
    if (clip === 'howToPlay') return this.heard.has('pointAndPress') && this.heard.has('howToPlayRest');
    if (clip === 'howToPlayMr') return this.heard.has('pointAndPressMr') && this.heard.has('howToPlayRest');
    return false;
  }
  /** Only natural audio completion calls this. Request, Skip, error, timeout and mute do not. */
  completed(clip: string): void {
    if (instructionSection(clip) === undefined || this.heard.has(clip)) return;
    this.heard.add(clip);
    // Combined recordings contain these exact fragments. Remember the words,
    // not only the asset filename, without hiding a different platform prompt.
    if (clip === 'howToPlay' || clip === 'howToPlayMr') {
      this.heard.add(clip === 'howToPlayMr' ? 'pointAndPressMr' : 'pointAndPress');
      this.heard.add('howToPlayRest');
    }
    this.save();
  }
  /** Proposed reminder seam, not hooked to a user-facing prompt yet. */
  resetSection(section: InstructionSection): void {
    for (const clip of this.heard) if (instructionSection(clip) === section) this.heard.delete(clip);
    this.save();
  }
  reset(): void { this.heard.clear(); this.save(); }
  private save(): void {
    try { this.storage?.setItem(INSTRUCTION_MEMORY_KEY, JSON.stringify({version: 1, heard: [...this.heard]})); } catch { /* session fallback */ }
  }
}
