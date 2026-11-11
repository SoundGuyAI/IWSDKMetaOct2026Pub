import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('startup main menu follows with in-game panel constants and hidden panels drop ray targeting', () => {
  const panel = readFileSync(new URL('../../src/panel.ts', import.meta.url), 'utf8');
  for (const c of ['PANEL_FOLLOW_DISTANCE_M', 'PANEL_FOLLOW_Y_OFFSET_M', 'PANEL_FOLLOW_SCALE', 'PANEL_LOOK_AWAY_DEG', 'PANEL_FOLLOW_SLERP']) {
    assert.ok(panel.includes(c), c);
  }
  assert.ok(panel.includes('update(delta: number)'));
  const app = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  assert.ok(app.includes("'main-menu-panel'") && app.includes('removeComponent(RayInteractable)'));
});
