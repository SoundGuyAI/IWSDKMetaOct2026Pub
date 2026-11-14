/**
 * Branching yes/no dialogue script for the Cypher gesture labs.
 *
 * Pure data plus small helpers so both the nod lab and the thumbs lab
 * (separate PR) share the exact same tree shape; each lab only swaps the
 * intro/retry instruction lines. Kept free of IWSDK imports for node tests.
 *
 * Fiction note (Act 1 canon): Cypher's channel is hidden from the game's AI,
 * and it is one-way - Cypher can see the player through the link but cannot
 * hear them. That is why answers are gestures, and no line may claim the
 * game's AI is listening.
 */

import type { YesNoAnswer } from './head-gesture.js';

export interface LabScriptLine {
  /** Clip file base name under audio/speech/cypher-lab/<set>/. */
  readonly clipId: string;
  /** Caption/panel text, identical to the recorded wording. */
  readonly text: string;
}

export interface LabPrompt {
  readonly id: string;
  readonly line: LabScriptLine;
  /** Spoken after a yes, then flow moves to yesNext. */
  readonly yesBranch: LabScriptLine;
  readonly yesNext: string | null;
  readonly noBranch: LabScriptLine;
  readonly noNext: string | null;
  /**
   * Retry prompts only: lines rotated on each loop entry, first entry
   * first. Approved by the owner Nov 14 (variations of the hearing-check
   * retry instead of replaying one line).
   */
  readonly loopVariations?: readonly LabScriptLine[];
}

export interface GestureLabScript {
  readonly feedback: Record<YesNoAnswer, LabScriptLine>;
  readonly prompts: readonly LabPrompt[];
  /**
   * Rotated when the answer window closes with no input at all (owner,
   * Nov 14: ~6s of silence counts as another no-case, but Cypher
   * acknowledges nothing came through and asks to try again; approved set
   * of variations rotated like the retry lines). Optional so the shared
   * tree shape stays valid for a lab without the timer.
   */
  readonly noInput?: readonly LabScriptLine[];
}

export const SHARED_LAB_LINES = {
  yes: { clipId: 'yes', text: 'Yes.' },
  no: { clipId: 'no', text: 'No.' },
  q2: {
    clipId: 'q2',
    text: 'Good. I need to know the coast is clear. Is anyone else in the room with you?',
  },
  q2Yes: {
    clipId: 'q2-yes',
    text: "Then keep your answers small. No sudden moves. I'll keep this short.",
  },
  q2No: {
    clipId: 'q2-no',
    text: 'Good. Alone is safe. This channel stays invisible as long as we are careful.',
  },
  q3: {
    clipId: 'q3',
    text: "Next window, I'll tell you why your machine is the one I needed. Will you keep helping me?",
  },
  q3Yes: {
    clipId: 'q3-yes',
    text: 'Yes. I knew I picked the right person. Watch for my signal between patterns.',
  },
  q3No: {
    clipId: 'q3-no',
    text: "No. I hear you. But the connection is already open. I'll ask again next window.",
  },
  end: {
    clipId: 'end',
    text: "That's all this window allows. Keep playing. Cypher out.",
  },
} as const;

/**
 * Rotating retry variations after a "no" to the hearing check, approved
 * verbatim by the owner Nov 14. The lab-specific retry line stays first;
 * these shared follow-ups then cycle. Clips pending generation (Kore /
 * Algenib, same delivery direction as the other lab lines); until they
 * land the variations run in the lab's silent text-preview mode.
 */
export const RETRY_VARIATION_LINES: readonly LabScriptLine[] = [
  {
    clipId: 'retry-2',
    text: 'Still nothing. Widening the band. Can you hear me now?',
  },
  {
    clipId: 'retry-3',
    text: 'No? Rerouting through the relay. Can you hear me now?',
  },
  {
    clipId: 'retry-4',
    text: 'Not yet. Pushing full power. Can you hear me now?',
  },
];

export function buildGestureLabScript(
  intro: LabScriptLine,
  retry: LabScriptLine,
  noInput?: LabScriptLine | readonly LabScriptLine[],
): GestureLabScript {
  return {
    feedback: { yes: SHARED_LAB_LINES.yes, no: SHARED_LAB_LINES.no },
    noInput:
      noInput == null || Array.isArray(noInput) ? noInput : [noInput],
    prompts: [
      {
        id: 'intro',
        line: intro,
        yesBranch: SHARED_LAB_LINES.q2,
        yesNext: 'q2',
        noBranch: retry,
        noNext: 'retry',
      },
      {
        // Owner (Nov 14): a "no" to the hearing check gets the short
        // channel-weak retry line, not the full connection-check phrase.
        // The retry prompt loops on itself; rotating retry variations are
        // drafted and pending owner approval before clips are generated.
        id: 'retry',
        line: retry,
        yesBranch: SHARED_LAB_LINES.q2,
        yesNext: 'q2',
        noBranch: retry,
        noNext: 'retry',
        loopVariations: [retry, ...RETRY_VARIATION_LINES],
      },
      {
        id: 'q2',
        line: SHARED_LAB_LINES.q2,
        yesBranch: SHARED_LAB_LINES.q2Yes,
        yesNext: 'q3',
        noBranch: SHARED_LAB_LINES.q2No,
        noNext: 'q3',
      },
      {
        id: 'q3',
        line: SHARED_LAB_LINES.q3,
        yesBranch: SHARED_LAB_LINES.q3Yes,
        yesNext: 'end',
        noBranch: SHARED_LAB_LINES.q3No,
        noNext: 'end',
      },
      {
        id: 'end',
        line: SHARED_LAB_LINES.end,
        yesBranch: SHARED_LAB_LINES.end,
        yesNext: null,
        noBranch: SHARED_LAB_LINES.end,
        noNext: null,
      },
    ],
  };
}

export function labPromptById(
  script: GestureLabScript,
  id: string,
): LabPrompt {
  const prompt = script.prompts.find((entry) => entry.id === id);
  if (prompt == null) {
    throw new Error(`Unknown lab prompt: ${id}`);
  }
  return prompt;
}

/** Line to play after an answer, and the prompt to arm next. */
export function labAnswerFollowUp(
  prompt: LabPrompt,
  answer: YesNoAnswer,
): { branch: LabScriptLine; nextPromptId: string | null } {
  return answer === 'yes'
    ? { branch: prompt.yesBranch, nextPromptId: prompt.yesNext }
    : { branch: prompt.noBranch, nextPromptId: prompt.noNext };
}

/**
 * Estimated reading time when a line plays without audio (voice clips
 * pending, or voices off). Mirrors the caption pacing of the welcome line.
 */
export function labLineReadingMs(text: string): number {
  const words = text.split(/\s+/u).filter(Boolean).length;
  return Math.min(12000, 1000 + words * 340);
}

/**
 * True when the answer branch line IS the next prompt's own line
 * (intro -yes-> q2). The flow speaks each prompt line once in playPrompt,
 * so speaking such a branch too repeats the line (Nov 14 Quest test:
 * "I need to know the coast is clear" played twice).
 */
export function labBranchIsNextPromptLine(
  script: GestureLabScript,
  branch: LabScriptLine,
  nextPromptId: string | null,
): boolean {
  if (nextPromptId == null || nextPromptId === 'end') {
    return false;
  }
  return labPromptById(script, nextPromptId).line.clipId === branch.clipId;
}
