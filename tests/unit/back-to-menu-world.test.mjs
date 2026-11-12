import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(
  join(root, 'src', 'wall-tones', 'back-to-menu-policy.ts'),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { backToMenuDestroysWorld } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

test('in-session Back to menu never destroys hub or AR worlds (#58)', () => {
  assert.equal(backToMenuDestroysWorld('hub-vr'), false);
  assert.equal(backToMenuDestroysWorld('walltones-ar'), false);
});

test('onBackToMenu keeps the live world instead of switchBackToHubMenu', () => {
  const system = readFileSync(
    join(root, 'src', 'wall-tones', 'wall-tones-system.ts'),
    'utf8',
  );
  const host = readFileSync(
    join(root, 'src', 'wall-tones', 'world-host.ts'),
    'utf8',
  );
  assert.match(system, /returnToMenuInPlace\(\)/);
  assert.match(host, /function returnToMenuInPlace/);
  assert.doesNotMatch(system, /await switchBackToHubMenu/);
  assert.match(
    host,
    /Do not use for in-session[\s\S]*Back to menu/,
  );
});
