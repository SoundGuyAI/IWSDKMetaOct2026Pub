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

const {
  GameOverHandGapTracker,
  GameOverThumbsFlow,
  DEFAULT_GAMEOVER_THUMBS_CONFIG: CFG,
  shouldRunGameOverThumbs,
} = await load('../../src/wall-tones/gameover-thumbs.ts');

/** Drive a flow with a pose pair held constant for `seconds`. */
const hold = (flow, left, right, start, seconds, step = 0.1) => {
  let event = null;
  for (let t = start; t < start + seconds && event == null; t += step) {
    event = flow.feed(left, right, t);
  }
  return event;
};

test('game over thumbs need immersive play with hand tracking', () => {
  assert.equal(shouldRunGameOverThumbs(true, true), true);
  assert.equal(shouldRunGameOverThumbs(true, false), false);
  assert.equal(shouldRunGameOverThumbs(false, true), false);
  assert.equal(shouldRunGameOverThumbs(false, false), false);
});

test('both thumbs up held together retry directly', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'up', 0, CFG.holdBothSec - 0.2), null);
  const event = hold(flow, 'up', 'up', CFG.holdBothSec, 0.3);
  assert.equal(event, 'retry');
  assert.equal(flow.isEnabled, false, 'terminal event self-disables');
});

test('one thumb up arms, then the other hand confirms', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'none', 0, CFG.holdArmSec + 0.2), 'armed');
  assert.equal(flow.isArmed, true);
  // Arming hand still up, other hand rises: confirms after holdConfirmSec.
  const event = hold(flow, 'up', 'up', 2, CFG.holdConfirmSec + 0.2);
  assert.equal(event, 'retry');
});

test('one thumb up arms, then the same hand confirms after a release', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'none', 0, CFG.holdArmSec + 0.2), 'armed');
  // Still holding without a release: never confirms on its own.
  assert.equal(hold(flow, 'up', 'none', 2, 3), null);
  // Release, then re-raise and hold: confirms.
  hold(flow, 'none', 'none', 6, 0.3);
  const event = hold(flow, 'up', 'none', 7, CFG.holdConfirmSec + 0.2);
  assert.equal(event, 'retry');
});

test('the other hand must actually hold to confirm, a flicker is not enough', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'none', 0, CFG.holdArmSec + 0.2), 'armed');
  // Other hand up briefly, below the confirm hold.
  assert.equal(hold(flow, 'none', 'up', 2, CFG.holdConfirmSec - 0.3), null);
  flow.feed('none', 'none', 3);
  assert.equal(flow.isEnabled, true);
  assert.equal(flow.isArmed, true);
});

test('thumb down starts a new run while idle and while armed', () => {
  const idle = new GameOverThumbsFlow();
  idle.setEnabled(true);
  assert.equal(hold(idle, 'down', 'none', 0, CFG.holdDownSec + 0.2), 'new-run');

  const armed = new GameOverThumbsFlow();
  armed.setEnabled(true);
  assert.equal(hold(armed, 'up', 'none', 0, CFG.holdArmSec + 0.2), 'armed');
  assert.equal(hold(armed, 'none', 'down', 2, CFG.holdDownSec + 0.2), 'new-run');
});

test('up gestures are inert while the retry is unaffordable, down still works', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  flow.setRetryAvailable(false);
  assert.equal(hold(flow, 'up', 'up', 0, CFG.holdBothSec + 1), null);
  assert.equal(flow.isArmed, false);
  assert.equal(hold(flow, 'none', 'down', 4, CFG.holdDownSec + 0.2), 'new-run');
});

test('a hold started before affordability returned does not count', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  flow.setRetryAvailable(false);
  hold(flow, 'up', 'up', 0, 2); // inert while unaffordable
  flow.setRetryAvailable(true);
  // Holds restarted at the flip, so the full deliberate hold still applies.
  assert.equal(flow.feed('up', 'up', 2.2), null);
});

test('disabled flow reports nothing and re-enables clean', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'none', 0, CFG.holdArmSec + 0.2), 'armed');
  flow.setEnabled(false);
  assert.equal(flow.isArmed, false);
  assert.equal(flow.feed('up', 'up', 5), null);
  flow.setEnabled(true);
  assert.equal(hold(flow, 'up', 'up', 6, CFG.holdBothSec + 0.2), 'retry');
});

test('hand gap tracker pauses short tracking loss, resets at the threshold', () => {
  const tracker = new GameOverHandGapTracker(1.0);
  assert.equal(tracker.note(true, 10), null);
  assert.equal(tracker.note(false, 10.2), 'pause');
  assert.equal(tracker.note(false, 10.8), 'pause');
  assert.ok(Math.abs(tracker.gapSec(10.8) - 0.6) < 1e-9);
  assert.equal(tracker.note(true, 11.0), null);
  assert.equal(tracker.gapSec(11.0), 0);
  assert.equal(tracker.note(false, 12.0), 'pause');
  assert.equal(tracker.note(false, 13.0), 'reset'); // 1.0s stretch hits the threshold
  assert.equal(tracker.note(false, 13.5), 'reset'); // stays reset while no hands
  tracker.reset();
  assert.equal(tracker.note(false, 14.0), 'pause');
});

test('a short tracking gap pauses the flow without losing a hold', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  flow.setRetryAvailable(true);
  const tracker = new GameOverHandGapTracker(1.0);
  const feed = (left, right, now) => {
    const gap = tracker.note(left != null || right != null, now);
    if (gap === 'reset') { flow.reset(); return null; }
    if (gap === 'pause') return null;
    return flow.feed(left, right, now);
  };
  // Both thumbs up for about a second, then tracking drops for 0.8s
  // (< threshold): frames are skipped, the hold survives.
  for (let t = 0; t < 1.0; t += 0.1) assert.equal(feed('up', 'up', t), null);
  for (let t = 1.0; t < 1.8; t += 0.1) assert.equal(feed(null, null, t), null);
  assert.equal(flow.isEnabled, true);
  // Hands back, still both up: the interrupted hold completes instead of
  // restarting from zero.
  let event = null;
  for (let t = 1.8; t < 2.2 && event == null; t += 0.1) event = feed('up', 'up', t);
  assert.equal(event, 'retry');
});

test('a tracking gap at the threshold restarts the gesture', () => {
  const flow = new GameOverThumbsFlow();
  flow.setEnabled(true);
  flow.setRetryAvailable(true);
  const tracker = new GameOverHandGapTracker(1.0);
  const feed = (left, right, now) => {
    const gap = tracker.note(left != null || right != null, now);
    if (gap === 'reset') { flow.reset(); return null; }
    if (gap === 'pause') return null;
    return flow.feed(left, right, now);
  };
  for (let t = 0; t < 1.0; t += 0.1) assert.equal(feed('up', 'up', t), null);
  // 1.2s with no tracked hand: the tracker asks for a restart.
  for (let t = 1.0; t < 2.2; t += 0.1) assert.equal(feed(null, null, t), null);
  // The partial pre-gap hold is gone: both thumbs up again needs the full
  // deliberate hold, so no retry well before 2.2 + 1.5s.
  let eventAt = null;
  for (let t = 2.2; t < 4.5 && eventAt == null; t += 0.1) {
    if (feed('up', 'up', t) != null) eventAt = t;
  }
  assert.ok(eventAt != null, 'retry eventually fires');
  assert.ok(eventAt >= 3.6, `retry fired too early at ${eventAt}: stale hold survived the reset`);
});
