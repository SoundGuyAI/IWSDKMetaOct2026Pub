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
