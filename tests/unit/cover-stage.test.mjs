import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Behavioral tests for the cover landing stage math (user ask, 2026-11-18):
// the spectrum strip animates in range, notes orbit the pads in 3D, and the
// idle pad flash follows the opening-fanfare order without overlap.
const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
mkdirSync(buildDir, { recursive: true });
for (const mod of ['cover-stage-math']) {
  const source = readFileSync(join(here, `../../src/wall-tones/${mod}.ts`), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(join(buildDir, `${mod}.js`), js);
}
const {
  SPECTRUM_BAR_COUNT,
  SPECTRUM_MIN_HEIGHT_M,
  SPECTRUM_MAX_HEIGHT_M,
  NOTE_ORBITS,
  FANFARE_STEP_S,
  fanfareFlash,
  noteOrbitPosition,
  spectrumBarHeight,
} = await import(join(buildDir, 'cover-stage-math.js'));

test('spectrum bars animate and stay inside their height range', () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < SPECTRUM_BAR_COUNT; i += 1) {
    for (let t = 0; t < 20; t += 0.1) {
      const h = spectrumBarHeight(i, t);
      assert.ok(h >= SPECTRUM_MIN_HEIGHT_M - 1e-9, `bar ${i} t ${t} above floor: ${h}`);
      assert.ok(h <= SPECTRUM_MAX_HEIGHT_M + 1e-9, `bar ${i} t ${t} under cap: ${h}`);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }
  // The strip actually moves: it must use most of its range, not sit flat.
  assert.ok(max - min > (SPECTRUM_MAX_HEIGHT_M - SPECTRUM_MIN_HEIGHT_M) * 0.5);
  // Adjacent bars differ somewhere (a travelling wave, not a block).
  const differs = [0, 1, 2, 3].some(
    (i) => Math.abs(spectrumBarHeight(i, 1.3) - spectrumBarHeight(i + 1, 1.3)) > 0.005,
  );
  assert.ok(differs, 'neighbouring bars animate out of phase');
});

test('notes circle the pad grid on tilted 3D orbits', () => {
  for (const orbit of NOTE_ORBITS) {
    // Radius is preserved in the orbit plane; position changes over time.
    const a = noteOrbitPosition(orbit, 0);
    const b = noteOrbitPosition(orbit, 1.234);
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    assert.ok(dist > 0.05, 'note travels along its orbit');
    // A real 3D path: y genuinely swings (not a flat ground circle).
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let t = 0; t < 40; t += 0.25) {
      const p = noteOrbitPosition(orbit, t);
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    }
    assert.ok(yMax - yMin > 0.15, `orbit tilts in 3D (y range ${yMax - yMin})`);
    // Notes never sink into the menu panel volume below the grid.
    assert.ok(yMin > -1.2, 'notes stay around the pads');
  }
});

test('fanfare flash lights one pad at a time, in order, then rests', () => {
  const padCount = 4;
  // Slot k peaks at the middle of its step.
  for (let slot = 0; slot < padCount; slot += 1) {
    const peak = slot * FANFARE_STEP_S + 0.25;
    assert.ok(fanfareFlash(slot, peak, padCount) > 0.85, `slot ${slot} peaks`);
    for (let other = 0; other < padCount; other += 1) {
      if (other !== slot) {
        assert.ok(
          fanfareFlash(other, peak, padCount) < 0.35,
          `slot ${other} dim while slot ${slot} peaks`,
        );
      }
    }
  }
  // After the last flash the cycle rests dark before repeating.
  const rest = padCount * FANFARE_STEP_S + 1.0;
  for (let slot = 0; slot < padCount; slot += 1) {
    assert.equal(fanfareFlash(slot, rest, padCount), 0);
  }
  // Envelope is smooth and bounded.
  for (let t = 0; t < 8; t += 0.05) {
    for (let slot = 0; slot < padCount; slot += 1) {
      const v = fanfareFlash(slot, t, padCount);
      assert.ok(v >= 0 && v <= 1 + 1e-9);
    }
  }
});
