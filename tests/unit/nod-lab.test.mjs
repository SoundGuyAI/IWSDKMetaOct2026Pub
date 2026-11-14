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

const gesture = await load('../../src/nod-lab/head-gesture.ts');
const { HeadNodShakeDetector, AxisOscillationTracker, DEFAULT_HEAD_GESTURE_CONFIG } = gesture;

const D = Math.PI / 180;
let now = 0;
const step = 1 / 72;
/** Feed a smooth swing from 0 to targetDeg and back, over `seconds`. */
function swing(feed, targetDeg, seconds) {
  const half = Math.max(2, Math.round((seconds / 2) / step));
  for (let i = 1; i <= half; i += 1) {
    now += step;
    feed((targetDeg * i) / half);
  }
  for (let i = half - 1; i >= 0; i -= 1) {
    now += step;
    feed((targetDeg * i) / half);
  }
}

test('a clean nod reports yes, a clean shake reports no', () => {
  const detector = new HeadNodShakeDetector();
  detector.setEnabled(true);
  now = 0;
  let event = null;
  swing((deg) => {
    event = event ?? detector.feed(-deg * D, 0, now);
  }, -22, 0.7);
  assert.equal(event?.answer, 'yes');

  detector.setEnabled(true);
  now += 2;
  event = null;
  swing((deg) => {
    event = event ?? detector.feed(0, deg * D, now);
  }, 20, 0.7);
  assert.equal(event?.answer, 'no');
});

test('small wobbles below the peak threshold do not fire', () => {
  const detector = new HeadNodShakeDetector();
  detector.setEnabled(true);
  now = 0;
  let fired = false;
  swing((deg) => {
    fired = fired || detector.feed(-deg * D, 0, now) != null;
  }, -9, 0.5);
  assert.equal(fired, false);
});

test('a slow look down and back up is not a nod', () => {
  const detector = new HeadNodShakeDetector();
  detector.setEnabled(true);
  now = 0;
  let fired = false;
  swing((deg) => {
    fired = fired || detector.feed(-deg * D, 0, now) != null;
  }, -25, 4);
  assert.equal(fired, false);
});

test('mixed-axis motion needs dominance to classify', () => {
  const detector = new HeadNodShakeDetector();
  detector.setEnabled(true);
  now = 0;
  let event = null;
  // Nod amplitude 22 deg but with an equally large simultaneous shake.
  swing((deg) => {
    event = event ?? detector.feed(-deg * D, deg * D, now);
  }, -22, 0.7);
  assert.equal(event, null);
});

test('cooldown blocks a second gesture right after the first', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    axisDominanceRatio: 1,
  });
  detector.setEnabled(true);
  now = 0;
  let first = null;
  swing((deg) => {
    first = first ?? detector.feed(-deg * D, 0, now);
  }, -22, 0.7);
  assert.equal(first?.answer, 'yes');
  // Detection disables itself after a report until the dialogue re-arms it.
  assert.equal(detector.isEnabled, false);
});

test('disabled detector ignores motion and rearms cleanly', () => {
  const detector = new HeadNodShakeDetector();
  now = 0;
  let fired = false;
  swing((deg) => {
    fired = fired || detector.feed(-deg * D, 0, now) != null;
  }, -25, 0.6);
  assert.equal(fired, false);
  detector.setEnabled(true);
  now += 1;
  let event = null;
  swing((deg) => {
    event = event ?? detector.feed(0, deg * D, now);
  }, 24, 0.7);
  assert.equal(event?.answer, 'no');
});

test('axis tracker commits extremes only past the reversal distance', () => {
  const tracker = new AxisOscillationTracker(DEFAULT_HEAD_GESTURE_CONFIG);
  now = 1000;
  const feed = (deg) => {
    now += step;
    return tracker.feed(deg * D, now);
  };
  for (const deg of [0, -10, -16, -15.5, -14]) assert.equal(feed(deg), null);
  // Reversal of 6 deg from a -16 deg extreme inside the window completes it.
  let completed = null;
  for (const deg of [-12, -9, -6]) completed = completed ?? feed(deg);
  assert.ok(completed != null && completed >= 14 * D);
});

const script = await load('../../src/nod-lab/lab-script.ts');
const { buildGestureLabScript, labPromptById, labAnswerFollowUp, labBranchIsNextPromptLine, labLineReadingMs } = script;

const intro = { clipId: 'intro-nod', text: 'intro line' };
const retry = { clipId: 'retry-nod', text: 'retry line' };
const tree = buildGestureLabScript(intro, retry);

test('script builder carries the optional no-input lines', () => {
  const lines = [
    { clipId: 'no-input-1', text: 'Nothing. Try again.' },
    { clipId: 'no-input-2', text: 'I saw nothing. Again.' },
  ];
  const withNoInput = buildGestureLabScript(intro, retry, lines);
  assert.equal(withNoInput.noInput?.length, 2);
  assert.equal(withNoInput.noInput?.[0].clipId, 'no-input-1');
  const single = buildGestureLabScript(intro, retry, {
    clipId: 'no-input-1',
    text: 'Nothing. Try again.',
  });
  assert.equal(single.noInput?.length, 1);
  assert.equal(buildGestureLabScript(intro, retry).noInput, undefined);
});

test('dialogue tree: intro no goes to the short retry loop, branches converge at q3 then end', () => {
  const p = labPromptById(tree, 'intro');
  assert.equal(labAnswerFollowUp(p, 'no').branch.clipId, 'retry-nod');
  // Nov 14: a no retries the short channel-weak line, not the full intro.
  assert.equal(labAnswerFollowUp(p, 'no').nextPromptId, 'retry');
  const retryPrompt = labPromptById(tree, 'retry');
  assert.equal(labAnswerFollowUp(retryPrompt, 'no').nextPromptId, 'retry');
  assert.equal(labAnswerFollowUp(retryPrompt, 'yes').nextPromptId, 'q2');
  assert.equal(labAnswerFollowUp(p, 'yes').nextPromptId, 'q2');
  for (const answer of ['yes', 'no']) {
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q2'), answer).nextPromptId, 'q3');
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q3'), answer).nextPromptId, 'end');
  }
  assert.equal(tree.feedback.yes.text, 'Yes.');
  assert.equal(tree.feedback.no.text, 'No.');
});

test('branch lines that are the next prompt line must not be spoken twice', () => {
  const p = labPromptById(tree, 'intro');
  const yes = labAnswerFollowUp(p, 'yes');
  // Nov 14 Quest test: "I need to know the coast is clear" played twice.
  assert.equal(labBranchIsNextPromptLine(tree, yes.branch, yes.nextPromptId), true);
  const no = labAnswerFollowUp(p, 'no');
  // The retry line is the retry prompt's own line: spoken once, in playPrompt.
  assert.equal(labBranchIsNextPromptLine(tree, no.branch, no.nextPromptId), true);
  const retryNo = labAnswerFollowUp(labPromptById(tree, 'retry'), 'no');
  assert.equal(labBranchIsNextPromptLine(tree, retryNo.branch, retryNo.nextPromptId), true);
  // Approved Nov 14 retry rotation: lab line first, then the shared variations.
  const retryPrompt = labPromptById(tree, 'retry');
  assert.equal(retryPrompt.loopVariations?.length, 4);
  assert.equal(retryPrompt.loopVariations?.[0].clipId, 'retry-nod');
  assert.deepEqual(
    retryPrompt.loopVariations?.map((line) => line.clipId),
    ['retry-nod', 'retry-2', 'retry-3', 'retry-4'],
  );
  assert.equal(
    retryPrompt.loopVariations?.[1].text,
    'Still nothing. Widening the band. Can you hear me now?',
  );
  assert.equal(
    retryPrompt.loopVariations?.[2].text,
    'No? Rerouting through the relay. Can you hear me now?',
  );
  assert.equal(
    retryPrompt.loopVariations?.[3].text,
    'Not yet. Pushing full power. Can you hear me now?',
  );
  for (const answer of ['yes', 'no']) {
    const q2 = labAnswerFollowUp(labPromptById(tree, 'q2'), answer);
    assert.equal(labBranchIsNextPromptLine(tree, q2.branch, q2.nextPromptId), false);
    const q3 = labAnswerFollowUp(labPromptById(tree, 'q3'), answer);
    assert.equal(labBranchIsNextPromptLine(tree, q3.branch, q3.nextPromptId), false);
  }
});

test('every line has a clip id and caption text; reading time is bounded', () => {
  const seen = new Set();
  for (const prompt of tree.prompts) {
    for (const line of [prompt.line, prompt.yesBranch, prompt.noBranch]) {
      assert.ok(line.clipId.length > 0);
      assert.ok(line.text.length > 0);
      seen.add(line.clipId);
    }
  }
  assert.ok(labLineReadingMs('Yes.') >= 1000);
  assert.ok(labLineReadingMs('word '.repeat(100)) <= 12000);
});

test('canon guard: no lab line claims the game AI can hear Cypher or the player', () => {
  const src = readFileSync(new URL('../../src/nod-lab/nod-lab-system.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../../src/nod-lab/lab-script.ts', import.meta.url), 'utf8');
  assert.ok(!/game is listening/i.test(src));
  assert.ok(/one way/i.test(src));
});

test('wiring: menu button, mode, panel asset, scene nodes and registration', () => {
  const menu = readFileSync(new URL('../../public/ui/main-menu.uikitml', import.meta.url), 'utf8');
  const appMode = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../../src/assets.ts', import.meta.url), 'utf8');
  const mainScene = readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8');
  const arScene = readFileSync(new URL('../../public/scenes/wall-tones-ar.iwsdk.scene.json', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../../src/wall-tones/world-host.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../../public/ui/nod-lab.uikitml', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../../public/ui/nod-lab-entry.uikitml', import.meta.url), 'utf8');
  // The lab entry is a separate compact panel floating under the menu, NOT a
  // button inside main-menu.uikitml: the desktop e2e specs click the three
  // menu buttons at calibrated pixel coordinates and an extra in-flow button
  // on the centre-anchored panel shifts those targets (broke CI twice).
  assert.ok(!menu.includes('nod-lab-button'), 'menu stays free of lab buttons');
  assert.ok(entry.includes('id="nod-lab-button"'));
  assert.ok(appMode.includes("'nodlab'"));
  assert.ok(appMode.includes("setNodeVisible('nod-lab-panel'"));
  assert.ok(appMode.includes("setNodeVisible('nod-lab-entry-panel'"));
  assert.ok(appMode.includes("getElementById('nod-lab-back-button')"));
  assert.ok(assets.includes("'nod-lab-panel': uikitml('nod-lab.uikitml'"));
  assert.ok(assets.includes("'nod-lab-entry-panel': uikitml('nod-lab-entry.uikitml'"));
  assert.ok(mainScene.includes('"id": "nod-lab-panel"'));
  assert.ok(mainScene.includes('"id": "nod-lab-entry-panel"'));
  assert.ok(arScene.includes('"id": "nod-lab-panel"'));
  assert.ok(arScene.includes('"id": "nod-lab-entry-panel"'));
  assert.ok(host.includes('NodLabSystem'));
  for (const id of ['nod-lab-status', 'nod-lab-line', 'nod-lab-telemetry', 'nod-lab-voice',
    'nod-lab-start-button', 'nod-lab-yes-button', 'nod-lab-no-button',
    'nod-lab-repeat-button', 'nod-lab-back-button']) {
    assert.ok(panel.includes(`id="${id}"`), id);
  }
  // UIKitML only compiles text for elements seeded with text content.
  for (const id of ['nod-lab-status', 'nod-lab-line', 'nod-lab-telemetry', 'nod-lab-voice', 'nod-lab-start-label']) {
    assert.ok(panel.match(new RegExp(`id="${id}"[^>]*>[^<]`)), `seeded ${id}`);
  }
});

test('clip spec covers every clip id used by both labs, in both voices', () => {
  const ids = new Set();
  for (const prompt of tree.prompts) {
    for (const line of [prompt.line, prompt.yesBranch, prompt.noBranch, ...(prompt.loopVariations ?? [])]) {
      ids.add(line.clipId);
    }
  }
  ids.add(tree.feedback.yes.clipId);
  ids.add(tree.feedback.no.clipId);
  const spec = readFileSync(new URL('../../docs/CYPHER_LAB_CLIPS.md', import.meta.url), 'utf8');
  const labSystem = readFileSync(new URL('../../src/nod-lab/nod-lab-system.ts', import.meta.url), 'utf8');
  for (const m of labSystem.matchAll(/clipId: '([a-z0-9-]+)'/g)) ids.add(m[1]);
  ids.add('intro-thumbs');
  ids.add('retry-thumbs');
  for (const id of ids) {
    assert.ok(spec.includes(`\`${id}\``), `spec lists ${id}`);
  }
  assert.ok(spec.includes('Kore'));
  assert.ok(spec.includes('Algenib'));
});

// --- Flat-mode input trackers (pointer drag + phone tilt) -----------------

const pointerMod = await load('../../src/nod-lab/pointer-gesture.ts');
const { PointerGestureTracker, POINTER_PX_PER_DEG, attachPointerTracker } = pointerMod;

test('pointer baseline follows the resting pointer while not armed, so a swing spanning the arm commits', () => {
  // Regression (Nov 14): a user who starts swinging while Cypher is still
  // speaking used to anchor the baseline mid-swing at the first post-arm
  // event; the rest of the swing read one-way and never committed.
  const listeners = new Map();
  const target = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const tracker = new PointerGestureTracker();
  let armed = false;
  const samples = [];
  attachPointerTracker(target, tracker, () => armed, (sample) => samples.push(sample));
  const move = (x, y, t) => listeners.get('pointermove')({ clientX: x, clientY: y });
  // Park at (640,400) while not armed: baseline must anchor here even
  // though no sample is reported.
  move(640, 400, 0);
  assert.equal(samples.length, 0);
  // Start the swing while still not armed (Cypher still speaking).
  move(655, 400, 0.1);
  assert.equal(samples.length, 0);
  // The prompt arms mid-swing; the peak and the return happen while armed.
  armed = true;
  move(670, 400, 0.2);
  move(655, 400, 0.3);
  move(640, 400, 0.4);
  // Samples are measured from the parked baseline, not the mid-swing spot:
  // the swing peaks at +15 deg (30 px at 2 px/deg) and returns to ~0.
  const peaks = samples.map((s) => s.yawDeg);
  assert.ok(Math.max(...peaks) >= 14, 'full swing measured');
  assert.ok(Math.abs(peaks.at(-1)) < 2, 'returned to baseline');
});

const tiltMod = await load('../../src/nod-lab/tilt-gesture.ts');
const { TiltBaselineTracker } = tiltMod;

/** Drive a detector through a pointer swing: out to delta px and back. */
function pointerSwing(detector, tracker, dx, dy, seconds) {
  let t = now;
  const half = Math.max(2, Math.round((seconds / 2) / step));
  let event = null;
  const feedTo = (fx, fy) => {
    // Swings are deltas from the primed resting spot (500, 300).
    const s = tracker.feed(500 + fx, 300 + fy, t);
    event = event ?? detector.feed(s.pitchDeg * D, s.yawDeg * D, t);
  };
  for (let i = 1; i <= half; i += 1) { t += step; feedTo((dx * i) / half, (dy * i) / half); }
  for (let i = half - 1; i >= 0; i -= 1) { t += step; feedTo((dx * i) / half, (dy * i) / half); }
  now = t;
  return event;
}

test('pointer drag down-up answers yes, left-right answers no', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new PointerGestureTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(500, 300, 0);
  const yes = pointerSwing(detector, tracker, 0, 110, 0.7);
  assert.equal(yes?.answer, 'yes');

  detector.setEnabled(true);
  tracker.reset();
  now += 2;
  tracker.feed(500, 300, now);
  const no = pointerSwing(detector, tracker, 110, 0, 0.7);
  assert.equal(no?.answer, 'no');
});

test('a one-way pointer drag (toward a button) never answers', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new PointerGestureTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(500, 300, 0);
  let fired = false;
  for (let i = 1; i <= 40; i += 1) {
    now += step;
    const s = tracker.feed(500 + i * 10, 300 + i * 5, now);
    fired = fired || detector.feed(s.pitchDeg * D, s.yawDeg * D, now) != null;
  }
  assert.equal(fired, false);
});

test('a small pointer wiggle around a rested spot does not fire', () => {
  // Guard floor: +-12px jitter. At the tuned 2 px/deg a +-12px wiggle reads
  // 12 deg below the 14 deg peak; +-20px jitter can now complete a cycle,
  // the accepted trade for the smaller desktop threshold.
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new PointerGestureTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(200, 200, 0);
  // Move far away slowly (no cycle), rest (a real resting pointer emits no
  // events), then wiggle +-12px around the new spot.
  for (let i = 1; i <= 30; i += 1) { now += 0.1; tracker.feed(200 + i * 12, 200, now); }
  now += 4;
  let fired = false;
  for (let i = 0; i < 20; i += 1) {
    now += step;
    const s = tracker.feed(560 + (i % 2 === 0 ? 12 : -12), 200, now);
    fired = fired || detector.feed(s.pitchDeg * D, s.yawDeg * D, now) != null;
  }
  assert.equal(fired, false);
});

test('a drag out that never returns to baseline does not fire', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new PointerGestureTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(500, 300, 0);
  let fired = false;
  // Out 150px and wiggle there: reversals happen, but the angle never
  // returns near baseline, so no cycle completes.
  for (let i = 1; i <= 15; i += 1) {
    now += step;
    const s = tracker.feed(500, 300 + i * 10, now);
    fired = fired || detector.feed(s.pitchDeg * D, s.yawDeg * D, now) != null;
  }
  for (let i = 0; i < 20; i += 1) {
    now += step;
    const s = tracker.feed(500, 450 + (i % 2 === 0 ? 25 : -25), now);
    fired = fired || detector.feed(s.pitchDeg * D, s.yawDeg * D, now) != null;
  }
  assert.equal(fired, false);
});

test('tilt forward/back answers yes, left/right answers no', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new TiltBaselineTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(45, 0);
  let event = null;
  swing((deg) => {
    const s = tracker.feed(45 + deg, 0);
    event = event ?? detector.feed(s.pitchDeg * D, s.yawDeg * D, now);
  }, 22, 0.7);
  assert.equal(event?.answer, 'yes');

  detector.setEnabled(true);
  tracker.reset();
  now += 2;
  tracker.feed(45, 0);
  event = null;
  swing((deg) => {
    const s = tracker.feed(45, deg);
    event = event ?? detector.feed(s.pitchDeg * D, s.yawDeg * D, now);
  }, 22, 0.7);
  assert.equal(event?.answer, 'no');
});

test('null tilt angles (unsupported sensor) produce no sample', () => {
  const tracker = new TiltBaselineTracker();
  assert.equal(tracker.feed(null, null), null);
  assert.equal(tracker.feed(45, null), null);
});

test('a mid-motion arm anchors at the rest pose so a later nod completes (iPhone regression)', () => {
  // Real failure (Nov 14 iPhone run): the phone was moving when listening
  // armed, so the tilt baseline anchored off-pose. After the user settled,
  // every later nod returned to the REST pose, never to the stale anchor,
  // so the mandatory return-to-baseline never completed. The tracker now
  // re-anchors toward a held pose once the head is still: settle 70->58 deg
  // while already armed, then nod down 25 deg and hold at 58 - the nod must
  // fire once the baseline converges to the rest pose.
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new TiltBaselineTracker();
  now = 0;
  // Converge the baseline on 70 deg while not armed (still counts while idle).
  for (let i = 0; i < 360; i += 1) { tracker.feed(70, 6); }
  detector.setEnabled(true);
  let event = null;
  const feed = (deg) => {
    const s = tracker.feed(deg, 6);
    const e = detector.feed(s.pitchDeg * D, 0, now);
    event = event ?? e;
  };
  // Mid-motion arm: user settles 70 -> 58 over 0.25 s while already listening.
  for (let i = 0; i < 15; i += 1) { now += 1 / 60; feed(70 - 12 * (i / 15)); }
  // Nod down 25 deg and back over 0.5 s.
  for (let i = 0; i < 30; i += 1) { now += 1 / 60; feed(58 - 25 * Math.sin(Math.PI * Math.min(1, i / 30))); }
  // Hold still at the rest pose until the baseline re-anchors.
  for (let i = 0; i < 240; i += 1) { now += 1 / 60; feed(58); }
  assert.equal(event?.answer, 'yes');
});

test('pointer scale keeps a deliberate flick above the peak threshold', () => {
  // A 90px flick must read as at least the 14 deg peak the detector needs.
  assert.ok(45 / POINTER_PX_PER_DEG >= 14); // 45px flick now clears the peak threshold
  // Desktop tuning (user request): 2 px per degree, so a nod peaks at ~28px.
  assert.equal(POINTER_PX_PER_DEG, 2);
});

test('a fast move, a pause, then a wiggle does not fire (idle re-prime)', () => {
  const detector = new HeadNodShakeDetector({
    ...DEFAULT_HEAD_GESTURE_CONFIG,
    returnToBaselineRad: DEFAULT_HEAD_GESTURE_CONFIG.activationRad,
  });
  const tracker = new PointerGestureTracker();
  detector.setEnabled(true);
  now = 0;
  tracker.feed(200, 200, 0);
  // Fast flick across the screen (0.15s), then rest 1s, then wiggle +-12px
  // (the +-20px floor moved with the 2 px/deg desktop tuning).
  for (let i = 1; i <= 10; i += 1) { now += 0.015; tracker.feed(200 + i * 40, 200, now); }
  now += 1;
  let fired = false;
  for (let i = 0; i < 20; i += 1) {
    now += step;
    const s = tracker.feed(600 + (i % 2 === 0 ? 12 : -12), 200, now);
    fired = fired || detector.feed(s.pitchDeg * D, s.yawDeg * D, now) != null;
  }
  assert.equal(fired, false);
});
