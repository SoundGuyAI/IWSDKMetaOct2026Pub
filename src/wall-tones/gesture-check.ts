/**
 * Cypher gesture-check story window (backlog item 105, thumbs half).
 *
 * The C02 "next-window" beat ("Can you hear me? ...") becomes interactive in
 * MR with hand tracking: Cypher runs the thumbs lab's connection check, the
 * player answers thumb up for yes / thumb down for no, and each detected
 * answer is acknowledged with the lab's recognition chime (owner, Nov 17:
 * reuse the lab sound cue when the game expects the gesture). Every other
 * platform keeps the recorded C02 line; the flat story is unchanged.
 *
 * Lines are the lab-verbatim, owner-approved clips (docs/CYPHER_LAB_CLIPS.md;
 * retry variations approved Nov 14), played through the shared cypher-lab
 * clip set - no new Cypher recordings. Pure data plus small helpers so the
 * flow stays unit-testable in plain node.
 */

// The line shape the labs share; re-declared here so this module stays
// import-free (the node test loader inlines single transpiled modules).
export interface LabScriptLine {
  /** Clip file base name under audio/speech/cypher-lab/<set>/. */
  readonly clipId: string;
  /** Caption/panel text, identical to the recorded wording. */
  readonly text: string;
}

/** The lab's connection-check opener, verbatim. */
export const GESTURE_CHECK_INTRO: LabScriptLine = {
  clipId: 'intro-thumbs',
  text: 'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So thumb up for yes. Thumb down for no. First question. Can you hear me?',
};

/** First retry after a "no" (thumbs down or idle), verbatim. */
export const GESTURE_CHECK_RETRY: LabScriptLine = {
  clipId: 'retry-thumbs',
  text: 'No? Then the channel is still weak. Let me boost the signal. Show me again. Thumb up if you can hear me now.',
};

/** Window closer after a "yes" or when the retries run out, verbatim
 * (SHARED_LAB_LINES.end in src/thumbs-lab/lab-script.ts). */
export const GESTURE_CHECK_END: LabScriptLine = {
  clipId: 'end',
  text: "That's all this window allows. Keep playing. Cypher out.",
};

/** Idle seconds before an unanswered prompt counts as a "no" (lab rule). */
export const GESTURE_ANSWER_TIMEOUT_S = 6;

/**
 * Retry lines in rotation order after the intro: the lab retry first, then
 * two of the approved Nov 14 variations. Unlike the lab's endless loop the
 * story window is bounded: when these run out Cypher closes the window so
 * play is never wedged between patterns.
 */
export const GESTURE_CHECK_RETRIES: readonly LabScriptLine[] = [
  GESTURE_CHECK_RETRY,
  // RETRY_VARIATION_LINES[0] and [1] from lab-script.ts, verbatim.
  {
    clipId: 'retry-2',
    text: 'Still nothing. Widening the band. Can you hear me now?',
  },
  {
    clipId: 'retry-3',
    text: 'No? Rerouting through the relay. Can you hear me now?',
  },
];

/** Retry line for one failed attempt, or null when the window gives up. */
export function gestureRetryLine(attempt: number): LabScriptLine | null {
  return GESTURE_CHECK_RETRIES[attempt] ?? null;
}

/**
 * The C02 beat runs as the interactive gesture check only where a thumb
 * answer is possible: immersive and a hand-tracking input source. Everywhere
 * else the caller plays the recorded C02 line instead.
 */
export function shouldRunGestureCheck(
  windowId: string,
  immersive: boolean,
  handTracking: boolean,
): boolean {
  return windowId === 'next-window' && immersive && handTracking;
}

/**
 * The nod half (backlog item 105): the codename window (C05-C06) ends with
 * the lab's q3 prompt, answered by head nod for yes / head shake for no.
 * Nod detection uses the headset pose only, so no hand tracking is needed -
 * the gate is immersive-only. Lines are the lab-verbatim SHARED_LAB_LINES
 * clips (docs/CYPHER_LAB_CLIPS.md), re-declared here so this module stays
 * import-free.
 */

/** The lab's q2 prompt, verbatim (SHARED_LAB_LINES.q2 in lab-script.ts). */
export const ROOM_CHECK_INTRO: LabScriptLine = {
  clipId: 'q2',
  text: 'Good. I need to know the coast is clear. Is anyone else in the room with you?',
};

/** Spoken after a yes (someone else is in the room), verbatim (q2Yes). */
export const ROOM_CHECK_YES: LabScriptLine = {
  clipId: 'q2-yes',
  text: "Then keep your answers small. No sudden moves. I'll keep this short.",
};

/** Spoken after a no or an idle timeout, verbatim (q2No). */
export const ROOM_CHECK_NO: LabScriptLine = {
  clipId: 'q2-no',
  text: 'Good. Alone is safe. This channel stays invisible as long as we are careful.',
};

/** The lab's q3 prompt, verbatim (SHARED_LAB_LINES.q3 in lab-script.ts). */
export const NOD_CHECK_INTRO: LabScriptLine = {
  clipId: 'q3',
  text: "Next window, I'll tell you why your machine is the one I needed. Will you keep helping me?",
};

/** Spoken after a detected nod, verbatim (SHARED_LAB_LINES.q3Yes). */
export const NOD_CHECK_YES: LabScriptLine = {
  clipId: 'q3-yes',
  text: 'Yes. I knew I picked the right person. Watch for my signal between patterns.',
};

/** Spoken after a head shake or an idle timeout (idle counts as a "no", lab
 * rule), verbatim (SHARED_LAB_LINES.q3No). */
export const NOD_CHECK_NO: LabScriptLine = {
  clipId: 'q3-no',
  text: "No. I hear you. But the connection is already open. I'll ask again next window.",
};

/**
 * The codename window gains the nod prompt only where a head answer is
 * possible: immersive play (the detector reads the headset pose, no hand
 * tracking required). Everywhere else the window keeps only its recorded
 * lines.
 */
export function shouldRunNodCheck(windowId: string, immersive: boolean): boolean {
  return windowId === 'codename' && immersive;
}
