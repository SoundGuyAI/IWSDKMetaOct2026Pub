import { expect, test } from '@playwright/test';
import { WallTonesSequence } from '../../src/wall-tones/sequence.js';

function completeRounds(game: WallTonesSequence, count: number): void {
  for (let round = 0; round < count; round += 1) {
    const length = game.sequence.length;
    for (let note = 0; note < length; note += 1) game.onCorrectInput();
  }
}

test('failed runs earn praise only by beating the previous best', () => {
  const game = new WallTonesSequence();
  game.startNewRun();
  expect(game.runImprovedBest).toBe(false); // immediate miss
  completeRounds(game, 3);
  expect(game.streak).toBe(3);
  expect(game.bestStreak).toBe(3);
  expect(game.runImprovedBest).toBe(true); // first personal best
  game.onWrongInput();
  expect(game.runImprovedBest).toBe(false);
  completeRounds(game, 2);
  expect(game.runImprovedBest).toBe(false); // below best
  game.onWrongInput();
  completeRounds(game, 3);
  expect(game.runImprovedBest).toBe(false); // tied best is not improvement
  completeRounds(game, 1);
  expect(game.streak).toBe(4);
  expect(game.bestStreak).toBe(4);
  expect(game.runImprovedBest).toBe(true); // best already updated, baseline retained
  game.onWrongInput();
  completeRounds(game, 1);
  expect(game.runImprovedBest).toBe(false);
  game.resetAllScores();
  game.startNewRun();
  completeRounds(game, 1);
  expect(game.runImprovedBest).toBe(true); // fresh session resets baseline too
});
