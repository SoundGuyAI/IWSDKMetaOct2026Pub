/** Browser speech lines for Wall Tones (English). */
export const WALL_TONES_SPEECH = {
  chooseMode:
    'Choose room scale to play on your walls, or sitting to play on a table.',
  lookAround:
    'I am looking at your room. Give me a few seconds to find the walls.',
  roomCapture:
    'I could not see enough surfaces. Open room capture on your headset, then we will look again.',
  padsOnWalls: 'I placed four buttons on your walls. Listen and repeat the pattern.',
  notEnoughWallSpace:
    'There is not enough wall space. Move the outlined buttons with your hand and pinch to place them beside you.',
  tableFound: 'I found a table. Listen and repeat the pattern.',
  noTable:
    'I could not find a table. Move the outlined buttons with your hand and pinch to place them in front of you.',
  airPlace: (step: number) =>
    `Outline ${step} of 4. Move your hand, then pinch to place.`,
  desktopReady:
    'Tap any colored pad once to turn sound on and start. All four pads take part in the pattern.',
  gameStart:
    'The game is starting. Watch the pads, listen to the tone, then repeat the pattern.',
  streakMilestone: (streak: number) =>
    streak >= 10
      ? `Great run. ${streak} in a row.`
      : `Nice. ${streak} in a row.`,
  wrongTouch: 'That was wrong. Let us start again.',
  backToMenu: 'Back to the main menu.',
  soundReady: 'Sound is on. Tap a pad to start.',
} as const;

/** Prime iOS Safari speech — call from the same tap as audio unlock. */
export function warmSpeechSynthesisFromGesture(): void {
  if (!('speechSynthesis' in globalThis)) {
    return;
  }
  globalThis.speechSynthesis.getVoices();
  const utterance = new SpeechSynthesisUtterance('Sound on.');
  utterance.lang = 'en-US';
  utterance.volume = 0.85;
  utterance.rate = 0.95;
  globalThis.speechSynthesis.speak(utterance);
}

export class WallTonesSpeech {
  speak(line: string): void {
    void this.speakAsync(line);
  }

  /** Speak a line and resolve when it finishes (or after a safety timeout). */
  speakAsync(line: string): Promise<void> {
    if (!('speechSynthesis' in globalThis)) {
      return Promise.resolve();
    }
    if (needsSpeechUnlock() && !speechUnlocked) {
      return Promise.resolve();
    }
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 0.95;
    const estimatedMs = Math.max(2500, line.split(/\s+/).length * 420);
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.setTimeout(finish, estimatedMs + 800);
      globalThis.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    globalThis.speechSynthesis?.cancel();
  }
}

let speechUnlocked = false;

function needsSpeechUnlock(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function unlockSpeechFromGesture(): void {
  speechUnlocked = true;
  warmSpeechSynthesisFromGesture();
}

export function resetSpeechUnlock(): void {
  speechUnlocked = !needsSpeechUnlock();
}
