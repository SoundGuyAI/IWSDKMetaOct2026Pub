import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The guard is TypeScript; check the exported constants and predicate through
// the source so the unit suite needs no TS loader.
const src = readFileSync(new URL('../../src/wall-tones/store-drag-guard.ts', import.meta.url), 'utf8');
const slop = Number(/STORE_TAP_SLOP_PX = (\d+)/.exec(src)[1]);
const exceeds = (dx, dy) => Math.hypot(dx, dy) > slop;

test('tap slop is a small distance in list px', () => {
  assert.ok(slop >= 8 && slop <= 24);
});
test('small jitter stays a tap, a real drag does not', () => {
  assert.equal(exceeds(3, 4), false);
  assert.equal(exceeds(0, slop), false);
  assert.equal(exceeds(0, slop + 1), true);
  assert.equal(exceeds(-30, 5), true);
});
test('store tile click handler consults the guard', () => {
  const sys = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
  assert.match(sys, /if \(storePressWasDrag\(\)\) return;\s*\n\s*this\.selectStoreTile\(t\.id\)/);
  assert.match(sys, /attachStoreDragGuard\(list as never\)/);
});
