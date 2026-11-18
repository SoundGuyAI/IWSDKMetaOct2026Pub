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
