import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Owner's Nov 16 iPhone pass: nods must work in portrait AND landscape,
// and a Sensitive preset must catch gentler nods than Standard allows.

const load = async (rel) => {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};

const gesture = await load('../../src/nod-lab/head-gesture.ts');
const tilt = await load('../../src/nod-lab/tilt-gesture.ts');
const {
  HeadNodShakeDetector,
  FLAT_HEAD_GESTURE_CONFIG,
  FLAT_SENSITIVE_GESTURE_CONFIG,
} = gesture;
const { TiltBaselineTracker, rotateToScreenFrame } = tilt;

const D = Math.PI / 180;

test('rotateToScreenFrame: landscape nod reads on the pitch axis', () => {
  // A physical nod with the phone held in landscape shows up on gamma.
  // At 90 deg the remapped pitch must carry it, not yaw.
  const p90 = rotateToScreenFrame(2, 14, 90);
  assert.ok(Math.abs(p90.pitchDeg - 14) < 1e-9, `pitch ${p90.pitchDeg}`);
  assert.ok(Math.abs(p90.yawDeg + 2) < 1e-9, `yaw ${p90.yawDeg}`);
  // Portrait is unchanged.
  const p0 = rotateToScreenFrame(14, 3, 0);
  assert.equal(p0.pitchDeg, 14);
  assert.equal(p0.yawDeg, 3);
  // 270 maps the other landscape direction onto pitch too.
  const p270 = rotateToScreenFrame(2, 14, 270);
  assert.ok(Math.abs(p270.pitchDeg + 14) < 1e-9, `pitch ${p270.pitchDeg}`);
});

test('tilt tracker: same nod detected in portrait and landscape', () => {
  // Beta/gamma sequences for one nod: portrait nods move beta, landscape
  // nods move gamma (device axes are fixed to the phone body).
  const nod = [0, 3, 7, 12, 16, 12, 7, 3, 0];
  for (const angle of [0, 90, 270]) {
    const tracker = new TiltBaselineTracker();
    const detector = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
    detector.setEnabled(true);
    let seen = null;
    let now = 0;
    // Prime the resting baseline while still.
    for (let i = 0; i < 20; i += 1) {
      tracker.feed(30, 10, angle);
      now += 1 / 60;
    }
    for (const offset of nod) {
      const beta = angle === 0 ? 30 + offset : 30;
      const gamma = angle === 0 ? 10 : 10 + offset;
      const sample = tracker.feed(beta, gamma, angle);
      now += 1 / 60;
      const event = detector.feed(
        sample.pitchDeg * D,
        sample.yawDeg * D,
        now,
      );
      if (event) seen = event;
    }
    assert.equal(seen?.answer, 'yes', `orientation ${angle}`);
  }
});

test('sensitive preset qualifies a gentle 8.5 deg nod standard misses', () => {
  const standard = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
  const sensitive = new HeadNodShakeDetector(FLAT_SENSITIVE_GESTURE_CONFIG);
  standard.setEnabled(true);
  sensitive.setEnabled(true);
  const nod = [0, 2, 4, 6, 8.5, 6, 4, 2, 0];
  let stdSeen = null;
  let senSeen = null;
  let now = 0;
  for (const deg of nod) {
    now += 1 / 60;
    stdSeen = stdSeen ?? standard.feed(deg * D, 0, now);
    senSeen = senSeen ?? sensitive.feed(deg * D, 0, now);
  }
  assert.equal(stdSeen, null);
  assert.equal(senSeen?.answer, 'yes');
});

test('sensitive preset keeps the 2.0 dominance guard against yaw wobble', () => {
  assert.equal(FLAT_SENSITIVE_GESTURE_CONFIG.axisDominanceRatio, 2.0);
});

test('setConfig swaps tuning live and resets stroke state', () => {
  const detector = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
  detector.setEnabled(true);
  let now = 0;
  // Arm a stroke under the standard config, then swap mid-gesture: no
  // stale state may leak a completion into the new config.
  for (const deg of [0, 3, 6, 9]) {
    now += 1 / 60;
    detector.feed(deg * D, 0, now);
  }
  detector.setConfig(FLAT_SENSITIVE_GESTURE_CONFIG);
  detector.setEnabled(true);
  // A gentle fresh nod completes under the new config.
  let seen = null;
  for (const deg of [0, 2, 4, 6, 8.5, 6, 4, 2, 0]) {
    now += 1 / 60;
    seen = seen ?? detector.feed(deg * D, 0, now);
  }
  assert.equal(seen?.answer, 'yes');
});

test('nod-lab panel exposes the sensitivity toggle and orientation wiring', () => {
  const uikitml = readFileSync(
    new URL('../../public/ui/nod-lab.uikitml', import.meta.url),
    'utf8',
  );
  const system = readFileSync(
    new URL('../../src/nod-lab/nod-lab-system.ts', import.meta.url),
    'utf8',
  );
  assert.match(uikitml, /nod-lab-sensitivity-button/);
  assert.match(uikitml, /nod-lab-sensitivity-label/);
  assert.match(system, /nod-lab-sensitivity-button/);
  assert.match(system, /readOrientationAngleDeg/);
  assert.match(system, /nod-lab-flat-sensitivity/);
});

test('tilt tracker: nod registers with the phone held pointing up after moving from a lower hold (Nov 17 report)', () => {
  // Owner's Nov 17 iPhone report: nods work at a normal holding angle,
  // but after moving the phone to point up (beta past the 80 deg gimbal
  // zone) and holding it there, nods stop registering. Inside the zone
  // the beta baseline froze at the pre-zone pose, so every sample carried
  // a constant pitch offset and the flat detector's return-to-baseline
  // requirement could never be satisfied. The zone branch must keep
  // converging the beta baseline to the resting pose (gamma stays 1:1,
  // untrusted there).
  const tracker = new TiltBaselineTracker();
  const detector = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
  detector.setEnabled(true);
  let now = 0;
  const events = [];
  const feed = (beta, gamma) => {
    const sample = tracker.feed(beta, gamma);
    now += 1 / 60;
    const event = detector.feed(sample.pitchDeg * D, sample.yawDeg * D, now);
    if (event) events.push(event);
  };
  // Settle at a normal holding angle and confirm a nod registers there.
  for (let i = 0; i < 120; i += 1) feed(45, 10);
  for (const offset of [0, 4, 8, 12, 8, 4, 0]) feed(45 + offset, 10);
  assert.equal(events.length, 1, 'nod at the normal hold');
  // The detector disables itself after each reported gesture; the lab's
  // next prompt re-arms it.
  detector.setEnabled(true);
  // Raise the phone to pointing up over ~1.5 s and hold it still for 3 s.
  for (let i = 1; i <= 90; i += 1) feed(45 + (40 * i) / 90, 10);
  for (let i = 0; i < 180; i += 1) feed(85, 10);
  // Nod while pointing up: out-and-back around the new resting pose.
  for (const offset of [0, 4, 8, 12, 8, 4, 0]) feed(85 + offset, 10);
  assert.equal(events.length, 2, 'nod with the phone pointing up');
  assert.equal(events[1]?.answer, 'yes');
});
