import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('collider debug control lives in main-menu Settings and is hidden on flat play', () => {
  const source = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
  const method = source.match(/private syncDebugCollidersButton\(\): void \{([\s\S]*?)\n\}\n/)[1];
  const js = ts.transpileModule(`function sync() {${method}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sync = new Function(`${js}; return sync;`)();
  let display; let text; let asked;
  const system = {
    showTouchDebug: false, desktop: false,
    useDesktopPath() { return this.desktop; },
    world: { getSceneObject: (id) => { asked = id; return { getElementById: (el) => ({ setProperties: (props) => {
      if (el === 'debug-colliders-button') display = props.display;
      if (el === 'debug-colliders-label') text = props.text;
    } }) }; } },
  };
  sync.call(system);
  assert.equal(asked, 'main-menu-panel');
  assert.equal(display, 'flex'); assert.equal(text, 'Debug colliders: OFF');
  system.showTouchDebug = true; sync.call(system); assert.equal(text, 'Debug colliders: ON');
  system.desktop = true; sync.call(system); assert.equal(display, 'none');
});

test('debug colliders button is no longer in the in-game panel', () => {
  const game = readFileSync(new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../public/ui/main-menu.uikitml', import.meta.url), 'utf8');
  assert.ok(!game.includes('debug-colliders-button'));
  assert.ok(menu.includes('debug-colliders-button'));
});
