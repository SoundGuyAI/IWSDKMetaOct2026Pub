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

test(`palm opens at ${OPEN_PALM_MIN_EXTENDED} extended fingers`, () => {
  const pos = handPositions({ extended: true });
  // Curl the pinky only: 3 extended still counts as open.
  pos[HAND_JOINT.pinkyTip] = [-0.065, 0.05, -0.05];
  const three = readPalmPose(makeJoints(pos), IDENTITY);
  assert.equal(three.extendedFingers, 3);
  assert.equal(three.open, true);
  // Curl ring too: 2 extended is not a palm.
  pos[HAND_JOINT.ringTip] = [-0.035, 0.05, -0.05];
  const two = readPalmPose(makeJoints(pos), IDENTITY);
  assert.equal(two.extendedFingers, 2);
  assert.equal(two.open, false);
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
