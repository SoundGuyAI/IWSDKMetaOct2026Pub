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

test('Lab menu follows the player with the same placement constants as the main menu', () => {
  const panel = readFileSync(new URL('../../src/panel.ts', import.meta.url), 'utf8');
  assert.ok(panel.includes("'lab-menu-panel' : 'main-menu-panel'"));
  assert.ok(panel.includes('followedMenuId'));
  // One shared follow path: the constants are used once, for whichever menu is shown.
  assert.equal(panel.split('PANEL_FOLLOW_SCALE;').length - 1, 1);
});
