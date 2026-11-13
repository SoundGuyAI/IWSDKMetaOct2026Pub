/**
 * Answer-recognition cues for the Cypher gesture labs.
 *
 * Owner (Nov 14 Quest test): the detected yes/no should be acknowledged by
 * two distinct gentle sound cues, not by Cypher speaking the words
 * "Yes."/"No.". This replaces the old spoken echo; lab only - gameplay
 * answer cues are undecided and stay unchanged.
 *
 * Yes is a soft rising chime, No a soft falling reply (sine tones, no
 * buzzer). Synthesized WebAudio, no assets. These are effects, not voice:
 * like the pad tones they are not gated by the voices-off accessibility
 * setting (that setting silences speech only). Silent only when no audio
 * context is available - the panel's "Answer received." status and
 * telemetry still confirm detection visually.
 */

import { ensureAudioRunning } from '../wall-tones/audio.js';
import type { YesNoAnswer } from './thumbs-gesture.js';

interface CueNote {
  readonly frequency: number;
  readonly startS: number;
  readonly durationS: number;
}

/** Gentle rising chime: E5 -> B5. */
const YES_NOTES: readonly CueNote[] = [
  { frequency: 659.25, startS: 0, durationS: 0.16 },
  { frequency: 987.77, startS: 0.13, durationS: 0.26 },
];

/** Gentle falling reply: B4 -> F#4. */
const NO_NOTES: readonly CueNote[] = [
  { frequency: 493.88, startS: 0, durationS: 0.18 },
  { frequency: 369.99, startS: 0.15, durationS: 0.28 },
];

const CUE_GAIN = 0.16;

/**
 * Play the recognition cue for one detected answer, resolving when the cue
 * finished (or immediately when no sound can play). Never rejects: a cue
 * must not wedge the dialogue.
 */
export async function playLabAnswerCue(answer: YesNoAnswer): Promise<void> {
  try {
    const context = await ensureAudioRunning();
    if (context == null) {
      return;
    }
    const notes = answer === 'yes' ? YES_NOTES : NO_NOTES;
    const start = context.currentTime + 0.01;
    let totalS = 0;
    for (const note of notes) {
      const t0 = start + note.startS;
      const t1 = t0 + note.durationS;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(CUE_GAIN, t0 + 0.02);
      gain.gain.setValueAtTime(CUE_GAIN, Math.max(t0 + 0.02, t1 - 0.07));
      gain.gain.linearRampToValueAtTime(0.0001, t1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(t0);
      oscillator.stop(t1);
      totalS = Math.max(totalS, note.startS + note.durationS);
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, totalS * 1000 + 30);
    });
  } catch {
    // Recognition stays visible on the panel even when audio fails.
  }
}
