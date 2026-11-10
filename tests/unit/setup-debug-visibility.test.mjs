import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('collider debug control hides throughout MR setup and remains available in MR play', () => {
  const source = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
  const method = source.match(/private syncDebugCollidersButton\(\): void \{([\s\S]*?)\n\}\n/)[1];
  const js = ts.transpileModule(`function sync() {${method}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sync = new Function(`${js}; return sync;`)();
  let display;
  const system = {
    flowPhase: 'choose-mode', experienceActive: true, showTouchDebug: false,
    useDesktopPath: () => false,
    world: { getSceneObject: () => ({ getElementById: id => ({ setProperties: props => {
      if (id === 'debug-colliders-button') display = props.display;
    } }) }) },
  };
  for (const phase of ['choose-mode', 'scanning', 'wall-picking', 'air-placement']) {
    system.flowPhase = phase; sync.call(system); assert.equal(display, 'none', phase);
  }
  system.flowPhase = 'playing'; sync.call(system); assert.equal(display, 'flex');
  system.useDesktopPath = () => true; sync.call(system); assert.equal(display, 'none');
  system.useDesktopPath = () => false; system.experienceActive = false;
  sync.call(system); assert.equal(display, 'none');
});
