import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const load = async (rel) => {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};

// lab-script.js imports thumbs-gesture.js only for a type, so both load clean.
const check = await load('../../src/wall-tones/gesture-check.ts');
const {
  GESTURE_CHECK_INTRO,
  GESTURE_CHECK_RETRY,
  GESTURE_CHECK_END,
  GESTURE_CHECK_RETRIES,
  GESTURE_ANSWER_TIMEOUT_S,
  gestureRetryLine,
  shouldRunGestureCheck,
} = check;

test('the gesture check only replaces C02 with hand tracking in MR', () => {
  assert.equal(shouldRunGestureCheck('next-window', true, true), true);
  assert.equal(shouldRunGestureCheck('next-window', true, false), false);
  assert.equal(shouldRunGestureCheck('next-window', false, true), false);
  assert.equal(shouldRunGestureCheck('connection', true, true), false);
});

test('intro and retry lines are the approved lab-verbatim wording', () => {
  assert.equal(GESTURE_CHECK_INTRO.clipId, 'intro-thumbs');
  assert.equal(
    GESTURE_CHECK_INTRO.text,
    'Connection check. This channel only goes one way. I can see you through the link, but I cannot hear you. So thumb up for yes. Thumb down for no. First question. Can you hear me?',
  );
  assert.equal(GESTURE_CHECK_RETRY.clipId, 'retry-thumbs');
  assert.equal(
    GESTURE_CHECK_RETRY.text,
    'No? Then the channel is still weak. Let me boost the signal. Show me again. Thumb up if you can hear me now.',
  );
  assert.equal(GESTURE_CHECK_END.clipId, 'end');
});

test('retry rotation is bounded: lab retry, two approved variations, then give up', () => {
  assert.equal(GESTURE_CHECK_RETRIES.length, 3);
  assert.equal(gestureRetryLine(0)?.clipId, 'retry-thumbs');
  assert.equal(gestureRetryLine(1)?.clipId, 'retry-2');
  assert.equal(gestureRetryLine(2)?.clipId, 'retry-3');
  assert.equal(gestureRetryLine(3), null);
  assert.equal(GESTURE_ANSWER_TIMEOUT_S, 6);
});

const {
  NOD_CHECK_INTRO,
  NOD_CHECK_YES,
  NOD_CHECK_NO,
  shouldRunNodCheck,
} = check;

test('the nod check only extends the codename window while immersive', () => {
  assert.equal(shouldRunNodCheck('codename', true), true);
  assert.equal(shouldRunNodCheck('codename', false), false);
  assert.equal(shouldRunNodCheck('your-machine', true), false);
  assert.equal(shouldRunNodCheck('next-window', true), false);
});

test('nod prompt and branch lines are the lab q3 wording verbatim', () => {
  assert.equal(NOD_CHECK_INTRO.clipId, 'q3');
  assert.equal(
    NOD_CHECK_INTRO.text,
    "Next window, I'll tell you why your machine is the one I needed. Will you keep helping me?",
  );
  assert.equal(NOD_CHECK_YES.clipId, 'q3-yes');
  assert.equal(
    NOD_CHECK_YES.text,
    'Yes. I knew I picked the right person. Watch for my signal between patterns.',
  );
  assert.equal(NOD_CHECK_NO.clipId, 'q3-no');
  assert.equal(
    NOD_CHECK_NO.text,
    "No. I hear you. But the connection is already open. I'll ask again next window.",
  );
});

test('room-check lines match the lab source lines byte for byte', async () => {
  const { ROOM_CHECK_INTRO, ROOM_CHECK_YES, ROOM_CHECK_NO } = check;
  const lab = readFileSync(new URL('../../src/nod-lab/lab-script.ts', import.meta.url), 'utf8');
  for (const line of [ROOM_CHECK_INTRO, ROOM_CHECK_YES, ROOM_CHECK_NO]) {
    assert.ok(lab.includes(line.text), `lab-script.ts contains ${line.clipId} text verbatim`);
  }
  assert.equal(ROOM_CHECK_INTRO.clipId, 'q2');
  assert.equal(ROOM_CHECK_YES.clipId, 'q2-yes');
  assert.equal(ROOM_CHECK_NO.clipId, 'q2-no');
});
