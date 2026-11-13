import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'lab-menu', 'lab-registry.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lab = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('foundation ships the two known demos as not connected', () => {
  assert.deepEqual(lab.LAB_ENTRIES.map((e) => e.id), ['nod', 'thumbs']);
  for (const entry of lab.LAB_ENTRIES) {
    assert.equal(lab.labRowTarget(entry), null);
    assert.match(lab.labRowLabel(entry), /not connected/);
  }
});

test('a connected entry opens its mode and drops the status suffix', () => {
  const entry = { id: 'x', label: 'X Lab', mode: 'xlab', available: true };
  assert.equal(lab.labRowTarget(entry), 'xlab');
  assert.equal(lab.labRowLabel(entry), 'X Lab');
  assert.equal(lab.labRowButtonId(entry), 'lab-row-x-button');
});

test('available without a mode never opens anything', () => {
  assert.equal(lab.labRowTarget({ id: 'y', label: 'Y', available: true }), null);
});

test('menu copy says demos now, gameplay integration later', () => {
  assert.match(lab.LAB_INTRO, /not part of the main game yet/);
  assert.match(lab.LAB_INTRO, /integrated into gameplay later/);
  const ui = readFileSync(join(root, 'public', 'ui', 'lab-menu.uikitml'), 'utf8');
  assert.ok(ui.includes(lab.LAB_INTRO));
  for (const entry of lab.LAB_ENTRIES) {
    assert.ok(ui.includes(`id="${lab.labRowButtonId(entry)}"`));
    assert.ok(ui.includes(`id="lab-row-${entry.id}-label"`));
  }
});

test('both scenes register the lab menu and entry panels', () => {
  for (const f of ['main.iwsdk.scene.json', 'wall-tones-ar.iwsdk.scene.json']) {
    const scene = JSON.parse(readFileSync(join(root, 'public', 'scenes', f), 'utf8'));
    const ids = [];
    const walk = (n) => { ids.push(n.id); (n.children ?? []).forEach(walk); };
    scene.nodes.forEach(walk);
    assert.ok(ids.includes('lab-menu-panel'), f);
    assert.ok(ids.includes('lab-entry-panel'), f);
  }
});
