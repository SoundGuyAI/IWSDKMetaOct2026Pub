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

const mod = await load('../../src/thumbs-lab/thumbs-gesture.ts');
const { classifyThumbPose, ThumbGestureDetector, DEFAULT_THUMB_GESTURE_CONFIG } = mod;

const v = (x, y, z) => ({ x, y, z });
/** Hand at origin: wrist at 0, knuckles 8cm forward, thumb up or down. */
function hand({ thumbUp = 1, extended = true, curled = true } = {}) {
  const wrist = v(0, 0, 0);
  const indexProximal = v(0.02, 0, -0.08);
  const middleProximal = v(0, 0, -0.085);
  const indexTip = curled ? v(0.02, -0.03, -0.075) : v(0.02, 0, -0.16);
  const middleTip = curled ? v(0, -0.035, -0.08) : v(0, 0, -0.17);
  const thumbProximal = v(0.045, 0, -0.045);
  const thumbTip = extended
    ? v(0.05, thumbUp * 0.07, -0.045)
    // Bent thumb: still points up, but the tip barely passes its base joint.
    : v(0.047, thumbUp * 0.012, -0.047);
  return { wrist, thumbProximal, thumbTip, indexProximal, indexTip, middleProximal, middleTip };
}

test('thumbs up and thumbs down classify from joint geometry', () => {
  assert.equal(classifyThumbPose(hand({ thumbUp: 1 })).pose, 'up');
  assert.equal(classifyThumbPose(hand({ thumbUp: -1 })).pose, 'down');
});

test('open palm, uncurled fingers and tucked thumb read as none', () => {
  assert.equal(classifyThumbPose(hand({ curled: false })).pose, 'none');
  assert.equal(classifyThumbPose(hand({ extended: false })).pose, 'none');
});

test('a sideways thumb reads as none', () => {
  const sideways = hand({ thumbUp: 1 });
  sideways.thumbTip = v(0.11, 0.005, -0.045);
  assert.equal(classifyThumbPose(sideways).pose, 'none');
});

test('detector needs the hold time and then reports yes/no with cooldown', () => {
  const detector = new ThumbGestureDetector();
  detector.setEnabled(true);
  const up = hand({ thumbUp: 1 });
  let now = 1000;
  assert.equal(detector.feed(null, up, now), null);
  now += 0.2;
  assert.equal(detector.feed(null, up, now), null); // still within hold
  now += 0.15;
  const event = detector.feed(null, up, now);
  assert.equal(event?.answer, 'yes');
  assert.equal(event?.hand, 'right');
  assert.equal(detector.isEnabled, false); // disarms until the dialogue re-arms

  detector.setEnabled(true);
  const down = hand({ thumbUp: -1 });
  now += 2;
  assert.equal(detector.feed(down, null, now), null);
  now += 0.35;
  const downEvent = detector.feed(down, null, now);
  assert.equal(downEvent?.answer, 'no');
  assert.equal(downEvent?.hand, 'left');
});

test('flicker shorter than the hold time never reports', () => {
  const detector = new ThumbGestureDetector();
  detector.setEnabled(true);
  const up = hand({ thumbUp: 1 });
  let fired = false;
  for (let i = 0; i < 10; i += 1) {
    const joints = i % 2 === 0 ? up : null;
    fired = fired || detector.feed(joints, null, 2000 + i * 0.05) != null;
  }
  assert.equal(fired, false);
});

test('disabled detector ignores poses and rearms cleanly', () => {
  const detector = new ThumbGestureDetector();
  const up = hand({ thumbUp: 1 });
  assert.equal(detector.feed(up, null, 3000), null);
  assert.equal(detector.feed(up, null, 3001), null);
  detector.setEnabled(true);
  assert.equal(detector.feed(up, null, 3002), null);
  const event = detector.feed(up, null, 3002.4);
  assert.equal(event?.answer, 'yes');
});

const script = await load('../../src/thumbs-lab/lab-script.ts');
const { buildGestureLabScript, labPromptById, labAnswerFollowUp } = script;
const tree = buildGestureLabScript(
  { clipId: 'intro-thumbs', text: 'intro line' },
  { clipId: 'retry-thumbs', text: 'retry line' },
);

test('dialogue tree: intro loops on no, branches converge at q3 then end', () => {
  const p = labPromptById(tree, 'intro');
  assert.equal(labAnswerFollowUp(p, 'no').branch.clipId, 'retry-thumbs');
  assert.equal(labAnswerFollowUp(p, 'no').nextPromptId, 'intro');
  assert.equal(labAnswerFollowUp(p, 'yes').nextPromptId, 'q2');
  for (const answer of ['yes', 'no']) {
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q2'), answer).nextPromptId, 'q3');
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q3'), answer).nextPromptId, 'end');
  }
});

test('canon guard: no lab line claims the game AI can hear Cypher or the player', () => {
  const src = readFileSync(new URL('../../src/thumbs-lab/thumbs-lab-system.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../../src/thumbs-lab/lab-script.ts', import.meta.url), 'utf8');
  assert.ok(!/game is listening/i.test(src));
  assert.ok(/one way/i.test(src));
  // The lab fiction premise is flagged as lab-only in the research doc.
  const doc = readFileSync(new URL('../../docs/THUMBS_LAB_RESEARCH.md', import.meta.url), 'utf8');
  assert.ok(/lab-only|lab only/i.test(doc));
});

test('wiring: menu button, mode, panel asset, scene nodes and registration', () => {
  const menu = readFileSync(new URL('../../public/ui/main-menu.uikitml', import.meta.url), 'utf8');
  const appMode = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../../src/assets.ts', import.meta.url), 'utf8');
  const mainScene = readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8');
  const arScene = readFileSync(new URL('../../public/scenes/wall-tones-ar.iwsdk.scene.json', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../../src/wall-tones/world-host.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../../public/ui/thumbs-lab.uikitml', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../../public/ui/thumbs-lab-entry.uikitml', import.meta.url), 'utf8');
  // The lab entry is a separate compact panel floating under the menu, NOT a
  // button inside main-menu.uikitml: the desktop e2e specs click the three
  // menu buttons at calibrated pixel coordinates and an extra in-flow button
  // on the centre-anchored panel shifts those targets (broke CI twice).
  assert.ok(!menu.includes('thumbs-lab-button'), 'menu stays free of lab buttons');
  assert.ok(entry.includes('id="thumbs-lab-button"'));
  assert.ok(appMode.includes("'thumbslab'"));
  assert.ok(appMode.includes("setNodeVisible('thumbs-lab-panel'"));
  assert.ok(appMode.includes("setNodeVisible('thumbs-lab-entry-panel'"));
  assert.ok(appMode.includes("getElementById('thumbs-lab-back-button')"));
  assert.ok(assets.includes("'thumbs-lab-panel': uikitml('thumbs-lab.uikitml'"));
  assert.ok(assets.includes("'thumbs-lab-entry-panel': uikitml('thumbs-lab-entry.uikitml'"));
  assert.ok(mainScene.includes('"id": "thumbs-lab-panel"'));
  assert.ok(mainScene.includes('"id": "thumbs-lab-entry-panel"'));
  assert.ok(arScene.includes('"id": "thumbs-lab-panel"'));
  assert.ok(arScene.includes('"id": "thumbs-lab-entry-panel"'));
  assert.ok(host.includes('ThumbsLabSystem'));
  for (const id of ['thumbs-lab-status', 'thumbs-lab-line', 'thumbs-lab-telemetry', 'thumbs-lab-voice',
    'thumbs-lab-start-button', 'thumbs-lab-yes-button', 'thumbs-lab-no-button',
    'thumbs-lab-repeat-button', 'thumbs-lab-back-button']) {
    assert.ok(panel.includes(`id="${id}"`), id);
  }
  for (const id of ['thumbs-lab-status', 'thumbs-lab-line', 'thumbs-lab-telemetry', 'thumbs-lab-voice', 'thumbs-lab-start-label']) {
    assert.ok(panel.match(new RegExp(`id="${id}"[^>]*>[^<]`)), `seeded ${id}`);
  }
});

test('clip spec covers every clip id used by the lab, in both voices', () => {
  const ids = new Set();
  for (const prompt of tree.prompts) {
    for (const line of [prompt.line, prompt.yesBranch, prompt.noBranch]) ids.add(line.clipId);
  }
  ids.add(tree.feedback.yes.clipId);
  ids.add(tree.feedback.no.clipId);
  const spec = readFileSync(new URL('../../docs/CYPHER_LAB_CLIPS.md', import.meta.url), 'utf8');
  const labSystem = readFileSync(new URL('../../src/thumbs-lab/thumbs-lab-system.ts', import.meta.url), 'utf8');
  for (const m of labSystem.matchAll(/clipId: '([a-z0-9-]+)'/g)) ids.add(m[1]);
  ids.add('intro-nod');
  ids.add('retry-nod');
  for (const id of ids) {
    assert.ok(spec.includes(`\`${id}\``), `spec lists ${id}`);
  }
  assert.ok(spec.includes('Kore'));
  assert.ok(spec.includes('Algenib'));
});
