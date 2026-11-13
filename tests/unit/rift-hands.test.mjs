import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'src', 'rift-lab', 'rift-hands.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const {
  readPalmPose,
  HAND_JOINT,
  FINGER_EXTENSION_RATIO,
  OPEN_PALM_MIN_EXTENDED,
  HAND_SEGMENTS,
  pointOnHandShape,
} = mod;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Build a 25-joint column-major buffer; positions in grip space. */
function makeJoints(positions) {
  const joints = new Float32Array(25 * 16);
  for (let j = 0; j < 25; j++) {
    const o = j * 16;
    joints[o + 0] = 1;
    joints[o + 5] = 1;
    joints[o + 10] = 1;
    joints[o + 15] = 1;
    const p = positions[j] ?? [0, 0, 0];
    joints[o + 12] = p[0];
    joints[o + 13] = p[1];
    joints[o + 14] = p[2];
  }
  return joints;
}

/** Synthetic right hand: wrist at origin, fingers along +Y. */
function handPositions({ extended }) {
  const pos = {};
  pos[HAND_JOINT.wrist] = [0, 0, 0];
  pos[HAND_JOINT.middleMetacarpal] = [0, 0.09, -0.02];
  const pairs = [
    [HAND_JOINT.indexProximal, HAND_JOINT.indexTip, 0.035],
    [HAND_JOINT.middleProximal, HAND_JOINT.middleTip, 0],
    [HAND_JOINT.ringProximal, HAND_JOINT.ringTip, -0.035],
    [HAND_JOINT.pinkyProximal, HAND_JOINT.pinkyTip, -0.065],
  ];
  for (const [proximal, tip, x] of pairs) {
    pos[proximal] = [x, 0.09, 0];
    // Extended: tip much farther from the wrist than the proximal joint.
    // Curled: tip pulled back toward the wrist.
    pos[tip] = extended ? [x, 0.17, -0.01] : [x, 0.05, -0.05];
  }
  return pos;
}

test('an open hand reads as an open palm, all fingers extended', () => {
  const pose = readPalmPose(makeJoints(handPositions({ extended: true })), IDENTITY);
  assert.ok(pose != null);
  assert.equal(pose.extendedFingers, 4);
  assert.equal(pose.open, true);
});

test('a closed fist is not an open palm', () => {
  const pose = readPalmPose(makeJoints(handPositions({ extended: false })), IDENTITY);
  assert.ok(pose != null);
  assert.equal(pose.extendedFingers, 0);
  assert.equal(pose.open, false);
});

test(`firing needs a really open hand: ${OPEN_PALM_MIN_EXTENDED} fully extended fingers`, () => {
  const pos = handPositions({ extended: true });
  // Curl the pinky only: 3 extended is no longer enough to start the beam.
  pos[HAND_JOINT.pinkyTip] = [-0.065, 0.05, -0.05];
  const three = readPalmPose(makeJoints(pos), IDENTITY);
  assert.equal(three.extendedFingers, 3);
  assert.equal(three.open, false);
  // ...but a running beam holds through it (hysteresis).
  assert.equal(three.holdOpen, true);
});

test('a barely opened fist neither starts nor holds the beam', () => {
  const pos = handPositions({ extended: false });
  // Fingers half-uncurled: tip about 1.3x the proximal wrist distance.
  for (const [prox, tip] of [
    [HAND_JOINT.indexProximal, HAND_JOINT.indexTip],
    [HAND_JOINT.middleProximal, HAND_JOINT.middleTip],
    [HAND_JOINT.ringProximal, HAND_JOINT.ringTip],
    [HAND_JOINT.pinkyProximal, HAND_JOINT.pinkyTip],
  ]) {
    pos[prox] = [pos[prox]?.[0] ?? 0, 0.09, 0];
    pos[tip] = [pos[prox][0], 0.1, -0.01];
  }
  const pose = readPalmPose(makeJoints(pos), IDENTITY);
  assert.equal(pose.open, false);
  assert.equal(pose.holdOpen, false);
});

test('a half-open hand (tips ~1.45x) is still too loose to start firing', () => {
  const pos = handPositions({ extended: true });
  for (const tip of [HAND_JOINT.indexTip, HAND_JOINT.middleTip, HAND_JOINT.ringTip, HAND_JOINT.pinkyTip]) {
    pos[tip] = [pos[tip][0], 0.13, -0.01];
  }
  const pose = readPalmPose(makeJoints(pos), IDENTITY);
  assert.equal(pose.open, false);
  assert.equal(pose.holdOpen, true);
});

test('hand-shape points ride the real joints in world space', () => {
  const grip = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1.4, -0.5, 1];
  const pose = readPalmPose(makeJoints(handPositions({ extended: true })), grip);
  assert.equal(pose.joints.length, 75);
  // Wrist joint is at the grip origin.
  assert.ok(Math.abs(pose.joints[1] - 1.4) < 1e-6);
  const point = [0, 0, 0];
  const dir = [0, 0, 0];
  // Segment 0 is wrist->thumb metacarpal (zero length in this synthetic
  // hand), so find a real one: middle chain wrist->middleMetacarpal.
  const idx = HAND_SEGMENTS.findIndex(([a, b]) => a === 0 && b === HAND_JOINT.middleMetacarpal);
  assert.ok(idx >= 0);
  assert.equal(pointOnHandShape(pose.joints, idx, 1, point, dir), true);
  assert.ok(Math.abs(point[1] - (1.4 + 0.09)) < 1e-6);
  assert.ok(dir[1] > 0.97);
  assert.ok(HAND_SEGMENTS.length >= 20);
});

test('extension is a wrist-distance ratio, so hand size cancels out', () => {
  const scaled = {};
  for (const [j, p] of Object.entries(handPositions({ extended: true }))) {
    scaled[j] = [p[0] * 0.6, p[1] * 0.6, p[2] * 0.6];
  }
  const pose = readPalmPose(makeJoints(scaled), IDENTITY);
  assert.equal(pose.open, true);
  assert.ok(FINGER_EXTENSION_RATIO > 1);
});

test('center and direction come out in world space through the grip matrix', () => {
  // Grip translated to (1, 1.4, -0.5): palm center follows.
  const grip = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1.4, -0.5, 1];
  const pose = readPalmPose(makeJoints(handPositions({ extended: true })), grip);
  assert.ok(pose != null);
  assert.ok(Math.abs(pose.center[0] - (1 + 0)) < 1e-6);
  assert.ok(Math.abs(pose.center[1] - (1.4 + 0.09)) < 1e-6);
  assert.ok(Math.abs(pose.center[2] - (-0.5 - 0.02)) < 1e-6);
  // Direction wrist -> middle metacarpal is +Y-ish, unit length.
  const len = Math.hypot(...pose.direction);
  assert.ok(Math.abs(len - 1) < 1e-6);
  assert.ok(pose.direction[1] > 0.97);
});

test('missing or short joint buffers yield no pose', () => {
  assert.equal(readPalmPose(null, IDENTITY), null);
  assert.equal(readPalmPose(undefined, IDENTITY), null);
  assert.equal(readPalmPose(new Float32Array(16), IDENTITY), null);
});

test('a degenerate all-zero buffer yields no aim direction', () => {
  assert.equal(readPalmPose(makeJoints({}), IDENTITY), null);
});
