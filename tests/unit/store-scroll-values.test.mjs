import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Critical MR store scrolling fix (owner report 2026-11-14): the skill tree
 * viewport must scroll for input modes that can only click (gaze/dwell,
 * head-direction selection), not just for held drags. Source-level wiring
 * checks plus behavioral tests of the pure clamp/enabled helpers.
 */

const ui = readFileSync(
  new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url),
  'utf8',
);
const sys = readFileSync(
  new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url),
  'utf8',
);

test('store popup has click-scroll chevrons and a top-right Bars balance', () => {
  for (const id of [
    'id="store-scroll-up"',
    'id="store-scroll-down"',
    'id="store-heading-row"',
    'id="store-bars-icon"',
    'id="store-bars-value"',
    'id="store-tree-list"',
  ]) {
    assert.ok(ui.includes(id), `uikitml missing ${id}`);
  }
  // Chevrons sit in a reserved gutter beside the tree viewport so they never
  // overlap tiles, labels, or the scrollbar (review feedback 2026-11-14).
  assert.ok(ui.includes('id="store-scroll-gutter"'), 'chevron gutter missing');
  const gutterAt = ui.indexOf('id="store-scroll-gutter"');
  const upAt = ui.indexOf('id="store-scroll-up"');
  const downAt = ui.indexOf('id="store-scroll-down"');
  assert.ok(gutterAt !== -1 && gutterAt < upAt && upAt < downAt, 'chevrons must live inside the gutter, up before down');
  for (const snippet of [
    'scrollStoreTreeBy',
    'syncStoreScrollButtons',
    'STORE_SCROLL_STEP',
    'clampStoreScroll',
    'storeScrollEnabled',
    "'store-bars-value'",
    "'store-scroll-up'",
    "'store-scroll-down'",
    "overflow: 'scroll'",
  ]) {
    assert.ok(sys.includes(snippet), `system missing ${snippet}`);
  }
});

const src = readFileSync(
  new URL('../../src/wall-tones/store-scroll.ts', import.meta.url),
  'utf8',
);
const js = ts.transpileModule(src, {
  compilerOptions: { module: 'esnext', target: 'es2022' },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { STORE_SCROLL_STEP, clampStoreScroll, storeScrollEnabled } = mod;

test('clampStoreScroll clamps into [0, maxY]', () => {
  assert.equal(clampStoreScroll(100, 500, STORE_SCROLL_STEP), 100 + STORE_SCROLL_STEP);
  assert.equal(clampStoreScroll(100, 500, -STORE_SCROLL_STEP), 0, 'up past top clamps to 0');
  assert.equal(clampStoreScroll(400, 500, STORE_SCROLL_STEP), 500, 'down past end clamps to max');
  assert.equal(clampStoreScroll(0, 0, STORE_SCROLL_STEP), 0, 'no overflow stays put');
  assert.equal(clampStoreScroll(50, -10, -STORE_SCROLL_STEP), 0, 'negative max treated as 0');
});

test('storeScrollEnabled dims the dead chevron at each end', () => {
  assert.deepEqual(storeScrollEnabled(0, 500), { up: false, down: true });
  assert.deepEqual(storeScrollEnabled(500, 500), { up: true, down: false });
  assert.deepEqual(storeScrollEnabled(250, 500), { up: true, down: true });
  assert.deepEqual(storeScrollEnabled(0, 0), { up: false, down: false });
});

test('chevron step is most of the 296px viewport but keeps context', () => {
  assert.ok(STORE_SCROLL_STEP > 150, 'step too small: too many presses');
  assert.ok(STORE_SCROLL_STEP < 296, 'step must keep an overlap for context');
});
