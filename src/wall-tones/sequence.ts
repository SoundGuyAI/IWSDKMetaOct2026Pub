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
  /** Best before this run, since bestStreak updates as soon as a round ends. */
  private bestStreakBeforeRun = 0;
  phase: GamePhase = 'idle';

  get runImprovedBest(): boolean {
    return this.streak > this.bestStreakBeforeRun;
  }

  /** Counts runs (a run is one game until a wrong note). */
  runId = 0;

  resetRun(): void {
    this.runId += 1;
    this.bestStreakBeforeRun = this.bestStreak;
    this.sequence.length = 0;
    this.inputStep = 0;
    this.streak = 0;
  }

  resetAllScores(): void {
    this.resetRun();
    this.bestStreak = 0;
    this.bestStreakBeforeRun = 0;
  }

  startNewRun(): void {
    this.runId += 1;
    this.bestStreakBeforeRun = this.bestStreak;
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
    this.startNewRun();
  }
}
