// Rift Lab recorded-SFX correctness fixes (author review 2026-11-17): source
// wiring checks on the actual module text, mirroring the speed/multiplier
// wiring-test pattern (node has no Web Audio to run the graph itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sounds = readFileSync(new URL('../../src/rift-lab/rift-sounds.ts', import.meta.url), 'utf8');
const system = readFileSync(new URL('../../src/rift-lab/rift-lab-system.ts', import.meta.url), 'utf8');

test('recorded loops connect their source into the positional gain (silent-loop fix)', () => {
  const loop = sounds.slice(sounds.indexOf('async function startClipLoop'));
  const body = loop.slice(0, loop.indexOf('\n}'));
  assert.match(body, /source\.connect\(out\.input\)/, 'buffer source must connect into the output gain');
  assert.match(body, /setPosition: out\.setPosition/, 'loop handle must expose setPosition');
});

test('ambience start carries a cancel token so a seal mid-decode cannot orphan a loop', () => {
  assert.match(sounds, /interface AmbienceEntry \{[\s\S]*cancelled: boolean/);
  assert.match(sounds, /entry\.cancelled \|\| !riftAmbience\.has\(riftId\)[\s\S]*handle\?\.stop\(0\)/);
  assert.match(sounds, /export function stopRiftAmbience[\s\S]*?entry\.cancelled = true/);
  assert.match(sounds, /export function stopAllRiftAmbience[\s\S]*?entry\.cancelled = true/);
});

test('beam hum follows the palm: repeated startBeamHum calls update the panners', () => {
  const beam = sounds.slice(sounds.indexOf('export function startBeamHum'));
  const body = beam.slice(0, beam.indexOf('\n}'));
  assert.match(body, /if \(beamHum != null\) \{[\s\S]*beamHum\.setPosition\?\./, 'existing hum must receive the new origin');
  assert.match(body, /hum\.setPosition = \(position\) => \{[\s\S]*bed\?\.setPosition\(position\);[\s\S]*crackle\?\.setPosition\(position\);/);
});

test('hand chime synth is positional and tone() accepts a destination node', () => {
  assert.match(sounds, /function tone\([\s\S]*?out\?: AudioNode/);
  const chime = sounds.slice(sounds.indexOf('export function playNoteChime'));
  const body = chime.slice(0, chime.indexOf('\n}'));
  assert.match(body, /sourceOutput\(ctx, position, 1\)\.input/);
  assert.match(body, /tone\(ctx, 'sine', f, f, t, 0\.45, 0\.16, out\)/);
});

test('debug seal path passes the rift position to playRiftSeal', () => {
  const dbg = system.slice(system.indexOf('private debugSealFirstRift'));
  const body = dbg.slice(0, dbg.indexOf('\n  }'));
  assert.match(body, /this\.riftViews\.get\(first\)\?\.position/);
  assert.match(body, /playRiftSeal\(position\)/);
});


test('note-sound comparison keeps the musical chime without an added recording', () => {
  const chime = sounds.slice(sounds.indexOf('export function playNoteChime'));
  const body = chime.slice(0, chime.indexOf('\n}'));
  assert.match(body, /tone\(ctx, 'sine', f, f, t, 0\.45, 0\.16, out\)/);
  assert.match(body, /tone\(ctx, 'sine', f \* 2, f \* 2, t, 0\.3, 0\.05, out\)/);
  assert.doesNotMatch(body, /playClip|handPlink/, 'no extra recording on note input');
  assert.match(system, /this\.game\.addNoteEnergy\(picked, hand\)/, 'charging stays enabled');
  assert.match(system, /playNoteChime\(picked,/, 'normal chime stays wired');
});

test('closing layers are bounded excerpts and opening skips its quiet lead-in', () => {
  assert.match(sounds, /name === 'portalOnset'\) \{ startSeconds = 0\.9; durationSeconds = 2\.5/);
  assert.match(sounds, /name === 'sealGliss'\) \{ startSeconds = 3; durationSeconds = 0\.9/);
  assert.match(sounds, /durationSeconds = 1\.1/);
  assert.match(sounds, /prepareOneShot\(ctx, name, buffer\)/);
  assert.match(sounds, /'sealChime', position, 0\.5, gliss \? 0\.15 : 0/);
});

test('approved beam arc starts at active crackle and both layers stay connected', () => {
  assert.match(sounds, /name === 'beamCrackle' \? Math\.min\(2, buffer\.duration \/ 2\) : 0/);
  assert.match(sounds, /'beamBed', hum\.origin, 0\.4, 0\.08/);
  assert.match(sounds, /'beamCrackle', hum\.origin, 0\.65, 0\.08/);
});
