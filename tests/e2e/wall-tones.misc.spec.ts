import { shouldAnnounceRecord } from '../../src/wall-tones/record-feedback.js';
import { expect, test } from '@playwright/test';
import { NEW_BEST_MALE } from '../../src/wall-tones/new-best-male.js';
import { NEW_BEST_FEMALE } from '../../src/wall-tones/new-best-female.js';
import { WallTonesSequence } from '../../src/wall-tones/sequence.js';

test('both voices contain all three approved playable new-best recordings', () => {
  for (const clips of [NEW_BEST_MALE, NEW_BEST_FEMALE]) {
    expect(Object.keys(clips)).toEqual(['newBest1', 'newBest2', 'newBest3']);
    for (const url of Object.values(clips)) {
      const data = Buffer.from(url.split(',')[1]!, 'base64');
      expect(url.startsWith('data:audio/mpeg;base64,')).toBe(true);
      expect(data.length).toBeGreaterThan(15000);
      expect(data.subarray(0, 3).toString()).toBe('ID3');
    }
  }
});

test('every record extension qualifies, ties and below-record rounds do not', () => {
  const game = new WallTonesSequence();
  game.startNewRun();
  const round = () => {
    const previous = game.bestStreak;
    for (let n = game.sequence.length; n > 0; n--) game.onCorrectInput();
    return game.streak > previous;
  };
  expect(round()).toBe(true);
  expect(round()).toBe(true);
  expect(round()).toBe(true);
  game.onWrongInput();
  expect(round()).toBe(false);
  expect(round()).toBe(false);
  expect(round()).toBe(false);
  expect(round()).toBe(true);
});

test('first-run record announcements are3,6,9 then11 onward, later runs every record', () => {
  expect(Array.from({length:12}, (_, i) => i+1).filter(n => shouldAnnounceRecord(n,n-1,true))).toEqual([3,6,9,11,12]);
  expect(shouldAnnounceRecord(4,3,false)).toBe(true);
  expect(shouldAnnounceRecord(4,4,false)).toBe(false);
});
