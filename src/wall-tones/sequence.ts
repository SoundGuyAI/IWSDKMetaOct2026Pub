import type { WallTonePadId } from './constants.js';

export type GamePhase =
  | 'idle'
  | 'playback'
  | 'input'
  | 'resetting';

export class WallTonesSequence {
  readonly sequence: WallTonePadId[] = [];
  inputStep = 0;
  streak = 0;
  bestStreak = 0;
  /** Best streak when the current run began; a failed run "increased the streak" when it beat this. */
  phase: GamePhase = 'idle';

  resetRun(): void {
    this.sequence.length = 0;
    this.inputStep = 0;
    this.streak = 0;
  }

  resetAllScores(): void {
    this.resetRun();
    this.bestStreak = 0;
  }

  startNewRun(): void {
    this.sequence.length = 0;
    this.inputStep = 0;
    this.streak = 0;
    this.appendRandomPad();
  }

  appendRandomPad(): WallTonePadId {
    const next = Math.floor(Math.random() * 4) as WallTonePadId;
    this.sequence.push(next);
    return next;
  }

  onCorrectInput(): boolean {
    this.inputStep += 1;
    if (this.inputStep < this.sequence.length) {
      return false;
    }
    this.streak = this.sequence.length;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
    }
    this.inputStep = 0;
    this.appendRandomPad();
    return true;
  }

  onWrongInput(): void {
    this.streak = 0;
    this.inputStep = 0;
    this.sequence.length = 0;
    this.appendRandomPad();
  }
}
