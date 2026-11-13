import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Transpile the real movement module so the test imports the shipped logic,
// not a copy (same pattern as table-pad-fit.test.mjs).
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
mkdirSync(buildDir, { recursive: true });
const source = readFileSync(join(here, '../../src/wall-tones/movement.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync(join(buildDir, 'movement.js'), js);
const movement = await import(join(buildDir, 'movement.js'));
const {
  MovementTracker,
  MOVE_DEAD_ZONE_M,
  MOVE_MAX_SPEED_MPS,
  MAX_PAD_REACH_M,
  formatMeters,
  formatMetersNumber,
  readLifetimeMovementMeters,
  MOVEMENT_STORAGE_KEYS,
} = movement;

// In-memory localStorage so persistence runs for real in node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const FPS = 1 / 60;

/** n frames walking a straight line, stepM meters per frame, from (x0, z0). */
function walk(tracker, { frames, stepM, x0 = 0, z0 = 0, t0 = 0 }) {
  let now = t0;
  for (let i = 1; i <= frames; i++) {
    now += FPS;
    tracker.noteHeadPosition(x0 + i * stepM, 1.6, z0, true, now);
  }
  return now;
}

test('head sway under the dead-zone counts nothing', () => {
  const t = new MovementTracker();
  let now = 0;
  for (let i = 0; i < 120; i++) {
    now += FPS;
    t.noteHeadPosition(Math.sin(i / 10) * 0.02, 1.6, Math.cos(i / 10) * 0.02, true, now);
  }
  assert.equal(t.getSessionHeadMeters() < MOVE_DEAD_ZONE_M, true);
});

test('a straight walk counts its distance within dead-zone tolerance', () => {
  const t = new MovementTracker();
  // 2cm per frame at 60fps = 1.2 m/s, under the speed cap; 100 frames = 2 m.
  walk(t, { frames: 100, stepM: 0.02 });
  const walked = t.getSessionHeadMeters();
  assert.equal(walked > 2 - MOVE_DEAD_ZONE_M - 0.02, true);
  assert.equal(walked <= 2 + 1e-9, true);
});

test('re-centering and tracking jumps re-anchor without counting', () => {
  const t = new MovementTracker();
  let now = walk(t, { frames: 50, stepM: 0.02 }); // ~1 m counted
  const before = t.getSessionHeadMeters();
  now += FPS;
  // A 10 m single-frame jump (guardian re-center / tracking loss).
  t.noteHeadPosition(10, 1.6, 0, true, now);
  assert.equal(t.getSessionHeadMeters(), before);
  // Walking resumes from the new anchor and counts again.
  walk(t, { frames: 50, stepM: 0.02, x0: 10, t0: now });
  assert.equal(t.getSessionHeadMeters() > before + 0.9, true);
});

test('motion above the speed cap is never counted', () => {
  const t = new MovementTracker();
  // 5cm per frame at 60fps = 3 m/s, over MOVE_MAX_SPEED_MPS.
  walk(t, { frames: 100, stepM: 0.05 });
  assert.equal(t.getSessionHeadMeters(), 0);
  assert.equal(MOVE_MAX_SPEED_MPS < 3, true, 'cap must sit below that sprint');
});

test('non-immersive samples count nothing and the XR gap is not a jump', () => {
  const t = new MovementTracker();
  let now = walk(t, { frames: 50, stepM: 0.02 });
  const before = t.getSessionHeadMeters();
  // Flat/menu samples, then XR resumes 5 m away (browser break mid-session).
  t.noteHeadPosition(2, 1.6, 0, false, (now += FPS));
  t.noteHeadPosition(7, 1.6, 0, true, (now += FPS));
  assert.equal(t.getSessionHeadMeters(), before);
  walk(t, { frames: 50, stepM: 0.02, x0: 7, t0: now });
  assert.equal(t.getSessionHeadMeters() > before + 0.9, true);
});

test('pad reach: distances between correct presses, first press anchors', () => {
  const t = new MovementTracker();
  t.noteCorrectPadPress(0, 1.5, -1, true); // anchor only
  assert.equal(t.getSessionPadMeters(), 0);
  t.noteCorrectPadPress(0.8, 1.5, -1, true);
  assert.equal(Math.abs(t.getSessionPadMeters() - 0.8) < 1e-9, true);
  // Re-pressing the same pad is no reach.
  t.noteCorrectPadPress(0.8, 1.5, -1, true);
  assert.equal(Math.abs(t.getSessionPadMeters() - 0.8) < 1e-9, true);
  // A press beyond the room-sized sanity cap counts nothing but re-anchors.
  t.noteCorrectPadPress(0.8 + MAX_PAD_REACH_M + 1, 1.5, -1, true);
  assert.equal(Math.abs(t.getSessionPadMeters() - 0.8) < 1e-9, true);
  // Flat-mode pads are a fixed grid, not a reach.
  t.noteCorrectPadPress(0.5, 0.5, 0, false);
  assert.equal(Math.abs(t.getSessionPadMeters() - 0.8) < 1e-9, true);
});

test('lifetime totals persist to localStorage and feed the achievement value', () => {
  store.clear();
  const t = new MovementTracker();
  walk(t, { frames: 100, stepM: 0.02 }); // ~2 m head
  t.noteCorrectPadPress(0, 1.5, -1, true);
  t.noteCorrectPadPress(1.3, 1.5, -1, true); // +1.3 m pad
  const expected = t.getLifetimeHeadMeters() + t.getLifetimePadMeters();
  assert.equal(Math.abs(readLifetimeMovementMeters() - Math.round(expected * 10) / 10) < 1e-9, true);
  // A fresh tracker on the same storage keeps the lifetime totals.
  const t2 = new MovementTracker();
  assert.equal(t2.getLifetimeHeadMeters() > 1.9, true);
  assert.equal(Math.abs(t2.getLifetimePadMeters() - 1.3) < 1e-9, true);
  assert.equal(MOVEMENT_STORAGE_KEYS.length, 2);
});

test('meter labels render one decimal', () => {
  assert.equal(formatMeters(0), '0.0 m');
  assert.equal(formatMeters(1.26), '1.3 m');
  assert.equal(formatMeters(12.04), '12.0 m');
  // Menu fields carry the digits only; the unit is a separate element.
  assert.equal(formatMetersNumber(0), '0.0');
  assert.equal(formatMetersNumber(1.26), '1.3');
  assert.equal(formatMetersNumber(12.04), '12.0');
});

test('achievement category, menu line and system hooks are wired', () => {
  const eco = readFileSync(join(here, '../../src/wall-tones/economy.ts'), 'utf8');
  const sys = readFileSync(join(here, '../../src/wall-tones/wall-tones-system.ts'), 'utf8');
  const ui = readFileSync(join(here, '../../public/ui/wall-tones-placeholder.uikitml'), 'utf8');
  assert.ok(eco.includes("id: 'movement'"), 'Movement achievement category');
  assert.ok(eco.includes('readLifetimeMovementMeters'), 'achievement value from movement storage');
  assert.ok(eco.includes('...MOVEMENT_STORAGE_KEYS'), 'debug stat reset clears movement totals');
  assert.ok(ui.includes('id="wall-tones-movement-row"'), 'menu movement row');
  assert.ok(ui.includes('id="wall-tones-movement-head"'), 'head field on the same line');
  assert.ok(ui.includes('id="wall-tones-movement-pad"'), 'pad reach field on the same line');
  assert.ok(sys.includes('tickMovementTracking'), 'per-frame headset sampling');
  assert.ok(sys.includes('noteCorrectPadPress'), 'pad reach hook on correct presses');
  assert.ok(sys.includes('pad != null && physicalTouch'), 'pad reach counts physical touches only, not ray/gaze');
  assert.ok(sys.includes('handlePadInput(pad.padIndex, true)'), 'fingertip touch passes the physical flag');
  assert.ok(ui.includes('stat-number-field'), 'number and unit split into a no-wrap field');
  assert.ok(sys.includes("movement: 'Movement'"), 'one-word tile name');
  assert.ok(sys.includes('resetPadAnchor'), 'pad anchor resets on re-placement');
});
