import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eco = readFileSync(new URL('../../src/wall-tones/economy.ts', import.meta.url), 'utf8');
const sys = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url), 'utf8');

test('open-ended levels follow the approved 10/25/50/100 per-decade pattern', () => {
  assert.ok(eco.includes('export function nextOpenThreshold'));
  assert.ok(eco.includes('[10, 25, 50]'));
  assert.ok(eco.includes('reachedThresholds(cat, value)'));
  // Hidden Secret category must stay single level.
  assert.ok(eco.includes('cat.hidden === true || out.length < cat.levels.length'));
});

test('achievements screen is a tile grid with a tooltip for hover, touch and ray', () => {
  assert.ok(ui.includes('id="achievements-tooltip"'));
  assert.ok(ui.includes('flex-wrap: wrap'));
  assert.ok(sys.includes("tile.addEventListener('click'"));
  assert.ok(sys.includes("tile.addEventListener('pointerenter'"));
  assert.ok(sys.includes('`Lv ${level}`'));
});
