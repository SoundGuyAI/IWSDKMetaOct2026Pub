import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'enter-xr-visibility.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { enterXrButtonVisible } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

test('Enter XR hides on phone-sized flat viewports, stays elsewhere', () => {
  assert.equal(enterXrButtonVisible(true, true, true), false); // iPhone/Android flat
  assert.equal(enterXrButtonVisible(true, true, false), true); // desktop / Quest browser flat
  assert.equal(enterXrButtonVisible(true, false, false), false); // XR unavailable
  assert.equal(enterXrButtonVisible(false, true, false), false); // immersive (Exit instead)
});

test('mobile identification survives rotation and wide viewports without hiding Quest', () => {
  assert.equal(enterXrButtonVisible(true, true, false, 'Mozilla iPhone'), false);
  assert.equal(enterXrButtonVisible(true, true, false, 'Mozilla Android Mobile'), false);
  assert.equal(enterXrButtonVisible(true, true, false, 'Mozilla Android OculusBrowser Quest'), true);
  assert.equal(enterXrButtonVisible(true, true, true, 'Mozilla Android OculusBrowser Quest'), true);
});
