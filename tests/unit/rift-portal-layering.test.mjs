import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = ts.transpileModule(
  readFileSync(join(root, 'src/rift-lab/rift-portal-layering.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { portalLayerOrders } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

test('flat mode keeps the portal in front of the menu panel', () => {
  assert.deepEqual(portalLayerOrders(false), {
    note: 3,
    spark: 4,
    fragment: 3,
    fracture: 0,
  });
});

test('XR mode draws the portal and its elements under the menu panel', () => {
  const o = portalLayerOrders(true);
  assert.equal(o.note, -1);
  assert.equal(o.spark, -1);
  assert.equal(o.fragment, -1);
  assert.equal(o.fracture, -1);
  // Every portal element sorts before the panel (renderOrder 0).
  for (const v of Object.values(o)) assert.ok(v < 0);
});
