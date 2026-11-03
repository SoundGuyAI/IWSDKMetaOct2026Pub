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
    'There is not enough wall space. Place four buttons in the air beside you.',
  tableFound: 'I found a table. Listen and repeat the pattern.',
  noTable:
    'I could not find a table. Place four buttons in the air beside you.',
  airPlace: (step: number) =>
    `Pinch to place button ${step} of 4.`,
  desktopReady: 'Four buttons are ready in front of you. The game is starting.',
  gameStart: 'The game is starting. Watch and listen.',
  roundSuccess: 'Good. Here is the next pattern.',
  wrongTouch: 'That was wrong. Let us start again.',
  backToMenu: 'Back to the main menu.',
} as const;

export class WallTonesSpeech {
  speak(line: string): void {
    if (!('speechSynthesis' in globalThis)) {
      return;
    }
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 0.95;
    globalThis.speechSynthesis.speak(utterance);
  }

  cancel(): void {
    globalThis.speechSynthesis?.cancel();
  }
}
