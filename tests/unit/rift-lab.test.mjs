import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'rift-lab', 'rift-energy.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const {
  RiftLabGame,
  PAD_COLORS,
  PAD_COLOR_NAMES,
  ENERGY_PER_NOTE,
  MAX_ENERGY,
  BEAM_MIN_ENERGY,
  SEAL_HOLD_MS,
  MAX_ORBIT_NOTES,
  OPEN_RIFT_MODIFIER_EFFECT,
} = mod;

const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('pad palette matches the four board colors', () => {
  assert.deepEqual(PAD_COLORS, {
    green: '#2ecc71',
    red: '#e74c3c',
    blue: '#3498db',
    yellow: '#f1c40f',
  });
  assert.equal(PAD_COLOR_NAMES.length, 4);
});

test('every successful note charges energy and adds an orbit note', () => {
  const game = new RiftLabGame(seq(0.5));
  game.addNoteEnergy('green', 'right');
  assert.equal(game.getEnergy(), ENERGY_PER_NOTE);
  assert.equal(game.getNotes().length, 1);
  assert.equal(game.getNotes()[0].color, 'green');
});

test('energy is capped and orbit cloud is bounded', () => {
  const game = new RiftLabGame(seq(0.5));
  for (let i = 0; i < 100; i++) game.addNoteEnergy('red');
  assert.equal(game.getEnergy(), MAX_ENERGY);
  assert.equal(game.getNotes().length, MAX_ORBIT_NOTES);
});

test('notes orbit both hands, densest on the firing hand', () => {
  // rand < 0.7 -> firing hand. Sequence gives 7 right, 3 left.
  const game = new RiftLabGame(seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.65, 0.8, 0.9, 0.99));
  for (let i = 0; i < 10; i++) game.addNoteEnergy('blue', 'right');
  const right = game.getNotes().filter((n) => n.hand === 'right').length;
  const left = game.getNotes().filter((n) => n.hand === 'left').length;
  assert.equal(right + left, 10);
  assert.ok(left > 0, 'both hands carry notes');
  assert.ok(right > left, 'the firing hand carries more');
});

test('switching the firing hand moves the dense side', () => {
  const game = new RiftLabGame(seq(0.1));
  game.addNoteEnergy('yellow', 'left');
  assert.equal(game.getFiringHand(), 'left');
  assert.equal(game.getNotes()[0].hand, 'left');
});

test('a spawned rift is an open four-color fracture', () => {
  const game = new RiftLabGame(seq(0.5));
  const rift = game.spawnRift();
  assert.equal(rift.state, 'open');
  assert.equal(new Set(rift.edgeColors).size, 4);
  for (const color of rift.edgeColors) {
    assert.ok(PAD_COLOR_NAMES.includes(color));
  }
});

test('his rule: modifier is on while a rift is open and lifts when cleared', () => {
  const game = new RiftLabGame(seq(0.5));
  assert.equal(game.openRiftModifierActive(), false);
  const rift = game.spawnRift();
  assert.equal(game.openRiftModifierActive(), true);
  for (let i = 0; i < 10; i++) game.addNoteEnergy('green');
  assert.ok(game.startBeam({ kind: 'xr-open-palm', hand: 'right' }));
  game.applyBeamOnRift(rift.id, SEAL_HOLD_MS);
  assert.equal(rift.state, 'sealed');
  // Sealed = no longer open, so the modifier lifts; clearSealed tidies up.
  assert.equal(game.openRiftModifierActive(), false);
  game.clearSealed();
  assert.equal(game.getRifts().length, 0);
});

test('modifier effect itself stays the unresolved no-op placeholder', () => {
  assert.equal(OPEN_RIFT_MODIFIER_EFFECT, null);
});

test('beam needs minimum energy and drains while sealing', () => {
  const game = new RiftLabGame(seq(0.5));
  assert.equal(game.canFireBeam(), false);
  assert.equal(game.startBeam({ kind: 'xr-open-palm', hand: 'right' }), false);
  game.addNoteEnergy('red');
  assert.equal(game.canFireBeam(), true);
  const rift = game.spawnRift();
  assert.ok(game.startBeam({ kind: 'xr-open-palm', hand: 'left' }));
  assert.equal(game.getBeamHand(), 'left');
  const before = game.getEnergy();
  game.applyBeamOnRift(rift.id, 500);
  assert.ok(game.getEnergy() < before);
  // One note of energy cannot sustain 500ms of beam: it dies mid-seal,
  // leaving partial progress on a still-open rift.
  assert.equal(game.getEnergy(), 0);
  assert.equal(game.isBeamActive(), false);
  assert.equal(rift.state, 'open');
  assert.ok(rift.sealProgressMs > 0);
});

test('holding the beam long enough seals the rift and stops the beam', () => {
  const game = new RiftLabGame(seq(0.5));
  for (let i = 0; i < 10; i++) game.addNoteEnergy('green');
  const rift = game.spawnRift();
  game.startBeam({ kind: 'mobile-drag', dx: 0.4, dy: -0.2 });
  game.applyBeamOnRift(rift.id, SEAL_HOLD_MS);
  assert.equal(rift.state, 'sealed');
  assert.equal(game.isBeamActive(), false);
});

test('beam cannot seal a rift it cannot afford', () => {
  const game = new RiftLabGame(seq(0.5));
  game.addNoteEnergy('green'); // exactly BEAM_MIN_ENERGY
  const rift = game.spawnRift();
  game.startBeam({ kind: 'xr-open-palm', hand: 'right' });
  game.applyBeamOnRift(rift.id, 100000); // would drain far more than held
  assert.equal(game.isBeamActive(), false);
  assert.notEqual(rift.state, 'sealed');
});

test('orbit angles advance with time', () => {
  const game = new RiftLabGame(seq(0.5));
  game.addNoteEnergy('green');
  const before = game.getNotes()[0].angle;
  game.updateOrbit(0.25);
  assert.notEqual(game.getNotes()[0].angle, before);
});

test('PC click target is an explicit unresolved no-op, never a mechanic', () => {
  const game = new RiftLabGame(seq(0.5));
  for (let i = 0; i < 5; i++) game.addNoteEnergy('green');
  const rift = game.spawnRift();
  const energy = game.getEnergy();
  assert.equal(game.onPcClick(), 'unresolved');
  assert.equal(game.getEnergy(), energy);
  assert.equal(game.isBeamActive(), false);
  assert.equal(rift.state, 'open');
});

test('BEAM_MIN_ENERGY is one successful note', () => {
  assert.equal(BEAM_MIN_ENERGY, ENERGY_PER_NOTE);
});
