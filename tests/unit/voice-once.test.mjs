import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url),
  'utf8',
);

test('store modifier description lines are once-only via the shared first-time flags', () => {
  assert.ok(
    src.includes('this.economy.takeFirstTime(`store-item-${this.storeSelected}`)'),
    'selectStoreTile gates its clip on takeFirstTime',
  );
});

test('achievement tile lines are once-only via the shared first-time flags', () => {
  assert.ok(
    src.includes('this.economy.takeFirstTime(`achv-cat-${catId}`)'),
    'speakAchievementClipOnce gates its clip on takeFirstTime',
  );
});

test('the achievement tile click handler speaks through the once-only guard', () => {
  assert.ok(src.includes('this.speakAchievementClipOnce(cat.id);'));
});

test('both once-only guards respect voices-off before consuming the flag', () => {
  const guards =
    src.match(
      /!voicesOffEnabled\(\) &&\s*\nthis\.economy\.takeFirstTime\(`(store-item|achv-cat)-/g,
    ) ?? [];
  assert.equal(guards.length, 2, 'store and achievement guards both check voicesOffEnabled first');
});
