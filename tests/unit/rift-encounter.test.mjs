import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

async function load(path) {
  const source = readFileSync(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

const {
  RiftEncounter,
  RIFT_STREAK_GATE,
  RIFT_PORTAL_COUNT,
  RIFT_FIRST_SPAWN_DELAY_MS,
  RIFT_SPAWN_INTERVAL_MS,
  RIFT_OPEN_SCORE_FACTOR,
  RIFT_ACK_LINE_ID,
} = await load('wall-tones/rift-encounter');
const { RiftLabGame, ENERGY_PER_NOTE, MAX_ENERGY, SEAL_ENERGY_REQUIRED } = await load('rift-lab/rift-energy');

function memStorage() {
  let value = null;
  return {
    getItem() { return value; },
    setItem(_key, next) { value = next; },
    read() { return value; },
  };
}

function rig() {
  const storage = memStorage();
  let now = 100_000;
  const encounter = new RiftEncounter(storage, () => now);
  return { storage, encounter, advance: (ms) => { now += ms; } };
}

test('settled constants: streak gate 15, three portals, paced spawns, x0.5 while open', () => {
  assert.equal(RIFT_STREAK_GATE, 15);
  assert.equal(RIFT_PORTAL_COUNT, 3);
  // Nov 19 playtest pacing: slower, staged spawns; sealed portals never respawn.
  assert.equal(RIFT_FIRST_SPAWN_DELAY_MS, 12_000);
  assert.equal(RIFT_SPAWN_INTERVAL_MS, 20_000);
  assert.equal(RIFT_OPEN_SCORE_FACTOR, 0.5);
  assert.equal(RIFT_ACK_LINE_ID, 'C24');
});

test('the seam window begins the encounter; portals spawn one by one ten seconds apart', () => {
  const { encounter, advance } = rig();
  assert.equal(encounter.consumeDueSpawn(), false, 'nothing before the seam');
  encounter.noteSeamWindowStarted();
  assert.ok(encounter.encounterActive());
  assert.ok(encounter.storyGateActive());
  assert.equal(encounter.consumeDueSpawn(), false, 'first portal waits its short delay');
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  assert.equal(encounter.consumeDueSpawn(), true, 'portal one');
  assert.equal(encounter.consumeDueSpawn(), false, 'no bunching');
  advance(RIFT_SPAWN_INTERVAL_MS);
  assert.equal(encounter.consumeDueSpawn(), true, 'portal two');
  advance(RIFT_SPAWN_INTERVAL_MS - 1);
  assert.equal(encounter.consumeDueSpawn(), false);
  advance(1);
  assert.equal(encounter.consumeDueSpawn(), true, 'portal three');
  advance(60_000);
  assert.equal(encounter.consumeDueSpawn(), false, 'exactly three, no fourth');
});

test('a failed spawn retries the same portal instead of skipping it', () => {
  const { encounter, advance } = rig();
  encounter.noteSeamWindowStarted();
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  assert.equal(encounter.consumeDueSpawn(), true);
  encounter.failLastSpawn();
  assert.equal(encounter.consumeDueSpawn(), false, 'retry waits');
  advance(2_000);
  assert.equal(encounter.consumeDueSpawn(), true, 'same portal retried');
  advance(RIFT_SPAWN_INTERVAL_MS);
  assert.equal(encounter.consumeDueSpawn(), true, 'schedule continues with portal two');
});

test('the streak-15 gate rearms only after the seam window is consumed', () => {
  const { encounter } = rig();
  encounter.ensureArmedForStreak(20, false);
  assert.equal(encounter.encounterActive(), false, 'story has not reached the seam yet');
  encounter.ensureArmedForStreak(14, true);
  assert.equal(encounter.encounterActive(), false, 'below the gate');
  encounter.ensureArmedForStreak(15, true);
  assert.ok(encounter.encounterActive(), 'rearmed at fifteen');
});

test('energy charges only while a portal is open, from approved sources', () => {
  const { encounter, advance } = rig();
  encounter.noteSeamWindowStarted();
  assert.equal(encounter.noteScored('green', 'manual'), false, 'no portal open yet');
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  encounter.consumeDueSpawn();
  encounter.setOpenRifts(1);
  assert.equal(encounter.noteScored('green', 'manual'), true);
  assert.equal(encounter.noteScored('red', 'play'), true);
  assert.equal(encounter.noteScored('blue', 'autoplay'), true);
  assert.deepEqual(
    [encounter.consumeCharge(), encounter.consumeCharge(), encounter.consumeCharge(), encounter.consumeCharge()],
    ['green', 'red', 'blue', null],
  );
  encounter.setOpenRifts(0);
  assert.equal(encounter.noteScored('yellow', 'manual'), false, 'collection pauses when none are open');
});

test('the single x0.5 score factor applies only while a portal is open', () => {
  const { encounter, advance } = rig();
  assert.equal(encounter.scoreFactor(), 1);
  encounter.noteSeamWindowStarted();
  assert.equal(encounter.scoreFactor(), 1, 'armed but nothing open');
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  encounter.consumeDueSpawn();
  encounter.setOpenRifts(1);
  assert.equal(encounter.scoreFactor(), 0.5);
  encounter.setOpenRifts(0);
  assert.equal(encounter.scoreFactor(), 1, 'lifts when cleared');
});

test('the third seal resolves the encounter and banks the acknowledgement', () => {
  const { encounter, advance, storage } = rig();
  encounter.noteSeamWindowStarted();
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  for (let i = 0; i < 3; i++) encounter.consumeDueSpawn(), advance(RIFT_SPAWN_INTERVAL_MS);
  encounter.noteSealed(1);
  assert.ok(encounter.encounterActive(), 'one sealed, two to go');
  encounter.noteSealed(1);
  assert.ok(encounter.encounterActive(), 'two sealed, one to go');
  encounter.noteSealed(1);
  assert.equal(encounter.encounterActive(), false, 'resolved');
  assert.equal(encounter.storyGateActive(), false, 'story may progress');
  assert.equal(encounter.takePendingAck(), 'C24');
  assert.equal(encounter.takePendingAck(), null, 'acknowledgement plays once');
  assert.match(storage.read(), /"resolved":true/);
});

test('a reload is a fresh run: unresolved encounters rearm at fifteen, resolved stays resolved', () => {
  const storage = memStorage();
  let now = 0;
  const first = new RiftEncounter(storage, () => now);
  first.noteSeamWindowStarted();
  const reloaded = new RiftEncounter(storage, () => now);
  assert.equal(reloaded.encounterActive(), false, 'live state is run-scoped');
  reloaded.ensureArmedForStreak(15, true);
  assert.ok(reloaded.encounterActive(), 'rearmed at fifteen after reload');
  reloaded.noteSealed(3);
  const again = new RiftEncounter(storage, () => now);
  assert.ok(again.isResolved);
  again.ensureArmedForStreak(15, true);
  assert.equal(again.encounterActive(), false, 'a finished encounter never returns');
});

test('New Run resets an unfinished encounter; misses never do', () => {
  const { encounter, advance } = rig();
  encounter.noteSeamWindowStarted();
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  encounter.consumeDueSpawn();
  encounter.setOpenRifts(1);
  encounter.noteScored('green', 'manual');
  encounter.noteSealed(1);
  // A miss changes nothing (no reset path here by design).
  assert.ok(encounter.encounterActive());
  assert.equal(encounter.consumeCharge(), 'green');
  encounter.setOpenRifts(1);
  encounter.noteScored('red', 'manual');
  encounter.onNewRun();
  assert.equal(encounter.encounterActive(), false, 'back to the arming rule');
  assert.ok(encounter.consumeClearRequested(), 'renderer clears portals and energy');
  assert.equal(encounter.consumeClearRequested(), false, 'clear consumed once');
  assert.equal(encounter.consumeCharge(), null, 'banked charge reset');
  encounter.ensureArmedForStreak(15, true);
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  assert.equal(encounter.consumeDueSpawn(), true, 'three fresh portals from the schedule');
  encounter.noteSealed(3);
  assert.ok(encounter.isResolved);
});

test('losing the renderer mid-encounter restarts from the arming rule', () => {
  const { encounter, advance } = rig();
  encounter.noteSeamWindowStarted();
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  encounter.consumeDueSpawn();
  encounter.onDriveLost();
  assert.equal(encounter.encounterActive(), false);
  encounter.ensureArmedForStreak(15, true);
  advance(RIFT_FIRST_SPAWN_DELAY_MS);
  assert.equal(encounter.consumeDueSpawn(), true, 'full schedule available again');
});

test('RiftLabGame keeps the settled economy values and resets a run fully', () => {
  assert.equal(ENERGY_PER_NOTE, 10);
  assert.equal(SEAL_ENERGY_REQUIRED, 120);
  assert.equal(MAX_ENERGY, 240);
  const game = new RiftLabGame(() => 0.5);
  game.addNoteEnergy('green');
  game.addNoteEnergy('red');
  game.spawnRift();
  assert.equal(game.getEnergy(), 20);
  assert.equal(game.getRifts().length, 1);
  game.resetRun();
  assert.equal(game.getEnergy(), 0, 'energy reset on New Run');
  assert.equal(game.getNotes().length, 0, 'orbit notes reset');
  assert.equal(game.getRifts().length, 0, 'portals reset');
  assert.equal(game.isBeamActive(), false);
});

test('the shared game holds the charge cap and the 120-energy seal', () => {
  const game = new RiftLabGame(() => 0.5);
  for (let i = 0; i < 30; i++) game.addNoteEnergy('yellow');
  assert.equal(game.getEnergy(), MAX_ENERGY, 'capped at 240');
  assert.equal(game.canFireBeam(), true);
  const rift = game.spawnRift();
  assert.equal(game.pcClickRift(rift.id), true, 'enough energy seals');
  assert.equal(game.getEnergy(), MAX_ENERGY - SEAL_ENERGY_REQUIRED, 'one seal costs 120');
  game.updateDesktopSeal(rift.id, 1_000);
  assert.equal(game.getRifts()[0].state, 'sealed');
});
