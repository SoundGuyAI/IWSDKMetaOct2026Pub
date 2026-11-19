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

const receiver = await load('../../src/voice-lab/voice-receiver.ts');
const {
  interpretScores,
  interpretFrames,
  FrameWindow,
  topTwo,
  parseAnswerWord,
  DEFAULT_ACCEPT_THRESHOLD,
  CLEAR_WIN_FLOOR,
  CLEAR_WIN_RATIO,
  PERSIST_FLOOR,
  PERSIST_RATIO,
  PERSIST_FRAMES,
  PERSIST_MIN_HITS,
  BACKGROUND_NOISE_WORD,
  VOICE_LISTEN_SEC,
  ANSWER_WORDS,
} = receiver;

const LABELS = ['yes', 'no', 'up', 'down', 'left', 'right'];
const MIC_LABELS = [...LABELS, BACKGROUND_NOISE_WORD, '_unknown_'];

test('a clear yes or no above the threshold answers the prompt', () => {
  // Alias-folded (Nov 20): yes 0.93 + left 0.01 answers at ~0.94.
  const yes = interpretScores(LABELS, [0.93, 0.02, 0.01, 0.01, 0.01, 0.02]);
  assert.equal(yes.kind, 'answer');
  assert.equal(yes.answer, 'yes');
  assert.ok(Math.abs(yes.score - 0.94) < 1e-9);
  const no = interpretScores(LABELS, [0.05, 0.8, 0.05, 0.03, 0.04, 0.03]);
  assert.deepEqual(no, { kind: 'answer', answer: 'no', score: 0.8 });
});

test('any other accepted word is noise, not an answer', () => {
  const heard = interpretScores(LABELS, [0.02, 0.02, 0.9, 0.02, 0.02, 0.02]);
  assert.deepEqual(heard, { kind: 'noise', word: 'up', score: 0.9 });
});

test('a top word below the threshold without a clear win is faint, never an answer', () => {
  const heard = interpretScores(LABELS, [0.5, 0.3, 0.1, 0.05, 0.03, 0.02]);
  assert.equal(heard.kind, 'faint');
  assert.equal(heard.word, 'yes');
  assert.equal(heard.score, 0.5);
  assert.ok(heard.score < DEFAULT_ACCEPT_THRESHOLD);
});

test('an accented yes/no below the threshold answers when it is the clear winner', () => {
  // Owner's Nov 19 live test: his "no" reacted but never answered.
  const no = interpretScores(LABELS, [0.05, 0.62, 0.18, 0.05, 0.05, 0.05]);
  assert.deepEqual(no, { kind: 'answer', answer: 'no', score: 0.62 });
  // Scores are alias-folded: yes 0.55 + left 0.08 = 0.63 (Nov 20 aliases).
  const yes = interpretScores(LABELS, [0.55, 0.02, 0.2, 0.1, 0.08, 0.05]);
  assert.deepEqual(yes, { kind: 'answer', answer: 'yes', score: 0.63 });
});

test('accent aliases: "go" counts toward "no", "left" toward "yes" (owner, Nov 20)', () => {
  const GO_LABELS = ['yes', 'no', 'go', 'up', 'down', 'left', 'right', BACKGROUND_NOISE_WORD, '_unknown_'];
  // His Nov 20 frame: Heard "go (0.52) vs no (0.48)" - the folded no is
  // 1.00, a direct above-threshold answer.
  assert.deepEqual(
    interpretScores(GO_LABELS, [0.0, 0.48, 0.52, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    { kind: 'answer', answer: 'no', score: 1.0 },
  );
  // A loud "go" alone answers "no" (aliased), it is no longer noise.
  const loudGo = interpretScores(GO_LABELS, [0.02, 0.05, 0.9, 0.01, 0.01, 0.01, 0.01, 0.05, 0.02]);
  assert.equal(loudGo.kind, 'answer');
  assert.equal(loudGo.answer, 'no');
  assert.ok(Math.abs(loudGo.score - 0.95) < 1e-9);
  // "left" folds into "yes" the same way.
  const loudLeft = interpretScores(GO_LABELS, [0.3, 0.02, 0.02, 0.01, 0.01, 0.6, 0.01, 0.02, 0.01]);
  assert.equal(loudLeft.kind, 'answer');
  assert.equal(loudLeft.answer, 'yes');
  assert.ok(Math.abs(loudLeft.score - 0.9) < 1e-9);
  // Below the threshold the folded duel still needs the clear-win bars:
  // go 0.3 + no 0.25 = 0.55 clears the floor with no rival.
  assert.deepEqual(
    interpretScores(GO_LABELS, [0.1, 0.25, 0.3, 0.05, 0.05, 0.05, 0.05, 0.1, 0.05]),
    { kind: 'answer', answer: 'no', score: 0.55 },
  );
  // ...but a contested duel (folded no 0.5 vs folded yes 0.3) fails the 2x ratio.
  assert.equal(
    interpretScores(GO_LABELS, [0.3, 0.3, 0.2, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0]).kind,
    'faint',
  );
});

test('non-alias words stay noise: only go/left fold into the yes/no duel', () => {
  const GO_LABELS = ['yes', 'no', 'go', 'up', 'down', 'left', 'right', BACKGROUND_NOISE_WORD, '_unknown_'];
  // "up" and "right" are not aliases: loud ones are noise, quiet ones faint.
  assert.deepEqual(
    interpretScores(GO_LABELS, [0.02, 0.02, 0.02, 0.9, 0.01, 0.01, 0.01, 0.02, 0.02]),
    { kind: 'noise', word: 'up', score: 0.9 },
  );
  assert.equal(
    interpretScores(GO_LABELS, [0.1, 0.1, 0.05, 0.1, 0.1, 0.05, 0.4, 0.05, 0.05]).kind,
    'faint',
  );
});

test('the clear-winner fallback weighs only the other answer word', () => {
  // Non-answer words neither win nor veto (owner, Nov 19: a "go" must
  // never be mistaken for a "no"): no 0.55 answers even with up at 0.4.
  assert.deepEqual(
    interpretScores(LABELS, [0.0, 0.55, 0.4, 0.02, 0.02, 0.01]),
    { kind: 'answer', answer: 'no', score: 0.55 },
  );
  // The other answer word is a rival: yes 0.4 vs no 0.6 is under the 2x ratio.
  assert.equal(interpretScores(LABELS, [0.4, 0.6, 0.0, 0.0, 0.0, 0.0]).kind, 'faint');
  // Under the floor, even with no rival.
  assert.equal(interpretScores(LABELS, [0.0, CLEAR_WIN_FLOOR - 0.01, 0.1, 0.1, 0.1, 0.1]).kind, 'faint');
  // An above-threshold non-answer word still wins as noise, never overridden.
  assert.deepEqual(
    interpretScores(LABELS, [0.05, 0.6, 0.85, 0.0, 0.0, 0.0]),
    { kind: 'noise', word: 'up', score: 0.85 },
  );
  assert.ok(CLEAR_WIN_RATIO >= 2);
});

test('background noise never vetoes a clear winner (iPhone room floor)', () => {
  // Owner's Nov 19 iPhone retest: yes/no register but take 2-3 attempts.
  // In a real room the noise class keeps scoring through the word, and
  // needing 2x against it blocked legit answers. It is the floor, not a
  // rival word.
  const no = interpretScores(MIC_LABELS, [0.05, 0.56, 0.1, 0.05, 0.05, 0.04, 0.4, 0.05]);
  assert.deepEqual(no, { kind: 'answer', answer: 'no', score: 0.56 });
  // _unknown_ no longer vetoes either: only the other answer word counts.
  const speech = interpretScores(MIC_LABELS, [0.05, 0.56, 0.1, 0.05, 0.05, 0.04, 0.1, 0.4]);
  assert.deepEqual(speech, { kind: 'answer', answer: 'no', score: 0.56 });
});

test('non-answer words still cannot veto the yes/no duel', () => {
  // Owner's Nov 19 iPhone frame: Heard "go (0.47) vs no (0.29)". Under the
  // Nov 20 aliases this frame answers "no" (0.29 + 0.47 = 0.76, clear win
  // over yes 0.05); up/right/_unknown_ still never answer or veto.
  const GO_LABELS = ['yes', 'no', 'go', 'up', 'down', 'left', 'right', BACKGROUND_NOISE_WORD, '_unknown_'];
  assert.deepEqual(
    interpretScores(GO_LABELS, [0.05, 0.29, 0.47, 0.02, 0.02, 0.02, 0.02, 0.1, 0.05]),
    { kind: 'answer', answer: 'no', score: 0.76 },
  );
  // A loud non-alias word is noise, not an answer...
  assert.deepEqual(
    interpretScores(GO_LABELS, [0.02, 0.05, 0.05, 0.9, 0.01, 0.01, 0.01, 0.05, 0.02]),
    { kind: 'noise', word: 'up', score: 0.9 },
  );
  // ...and moderate non-alias scores through the window cast no votes.
  const window = new FrameWindow();
  assert.equal(
    window.push(GO_LABELS, [0.05, 0.1, 0.05, 0.3, 0.05, 0.05, 0.2, 0.1, 0.1]).kind,
    'faint',
  );
  assert.equal(
    window.push(GO_LABELS, [0.05, 0.1, 0.05, 0.3, 0.05, 0.05, 0.2, 0.1, 0.1]).kind,
    'faint',
  );
});

test('persistence vote: a word split across windows answers on repeat moderate scores', () => {
  const window = new FrameWindow();
  const frame = (noScore) => ({
    labels: MIC_LABELS,
    scores: [0.05, noScore, 0.1, 0.05, 0.05, 0.05, 0.3, 0.05],
  });
  // One moderate frame alone is still faint.
  assert.equal(window.push(MIC_LABELS, frame(0.42).scores).kind, 'faint');
  // The same word clearing the relaxed bars twice in the window answers.
  const heard = window.push(MIC_LABELS, frame(0.4).scores);
  assert.deepEqual(heard, { kind: 'answer', answer: 'no', score: 0.42 });
});

test('persistence vote rejects one-off noise and contested words', () => {
  // A single moderate frame followed by silence never answers.
  const quiet = new FrameWindow();
  const silence = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.85, 0.03];
  assert.equal(quiet.push(MIC_LABELS, [0.05, 0.42, 0.1, 0.05, 0.05, 0.05, 0.2, 0.05]).kind, 'faint');
  // Pure background above the threshold is noise, and it never votes.
  assert.equal(quiet.push(MIC_LABELS, silence).kind, 'noise');
  assert.equal(quiet.push(MIC_LABELS, silence).kind, 'noise');
  assert.equal(quiet.push(MIC_LABELS, silence).kind, 'noise');
  // yes and no tied inside the same window: no winner.
  const contested = new FrameWindow();
  contested.push(MIC_LABELS, [0.42, 0.05, 0.1, 0.05, 0.05, 0.05, 0.2, 0.05]);
  const heard = contested.push(MIC_LABELS, [0.05, 0.42, 0.1, 0.05, 0.05, 0.05, 0.2, 0.05]);
  assert.equal(heard.kind, 'faint');
  // Under the relaxed floor, even twice, is not a word.
  const weak = new FrameWindow();
  const weakFrame = [0.05, PERSIST_FLOOR - 0.01, 0.1, 0.1, 0.1, 0.1, 0.2, 0.05];
  assert.equal(weak.push(MIC_LABELS, weakFrame).kind, 'faint');
  assert.equal(weak.push(MIC_LABELS, weakFrame).kind, 'faint');
  assert.ok(PERSIST_MIN_HITS >= 2 && PERSIST_MIN_HITS <= PERSIST_FRAMES);
  assert.ok(PERSIST_FLOOR < CLEAR_WIN_FLOOR && PERSIST_RATIO < CLEAR_WIN_RATIO);
});

test('interpretFrames lets a decisive latest frame win over stale window votes', () => {
  const frames = [
    { labels: MIC_LABELS, scores: [0.42, 0.05, 0.1, 0.05, 0.05, 0.05, 0.2, 0.05] },
    { labels: MIC_LABELS, scores: [0.4, 0.05, 0.1, 0.05, 0.05, 0.05, 0.2, 0.05] },
    { labels: MIC_LABELS, scores: [0.02, 0.9, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02] },
  ];
  // Latest frame clears the full threshold outright: answer immediately.
  assert.deepEqual(interpretFrames(frames), { kind: 'answer', answer: 'no', score: 0.9 });
  assert.equal(interpretFrames([]).kind, 'faint');
});

test('topTwo reports the live top classes for the Heard line', () => {
  const live = topTwo(MIC_LABELS, [0.05, 0.46, 0.1, 0.05, 0.05, 0.05, 0.4, 0.05]);
  assert.deepEqual(live, { word: 'no', score: 0.46, rivalWord: BACKGROUND_NOISE_WORD, rivalScore: 0.4 });
  assert.deepEqual(topTwo([], []), { word: 'invalid', score: 0, rivalWord: '-', rivalScore: 0 });
});

test('malformed model output is faint, never throws', () => {
  assert.equal(interpretScores([], []).kind, 'faint');
  assert.equal(interpretScores(['yes'], [Number.NaN]).kind, 'faint');
  assert.equal(interpretScores(['yes'], [0.9, 0.1]).kind, 'faint');
});

test('parseAnswerWord normalizes case and punctuation, rejects other words', () => {
  assert.equal(parseAnswerWord('Yes.'), 'yes');
  assert.equal(parseAnswerWord(' NO!'), 'no');
  assert.equal(parseAnswerWord('yes?'), 'yes');
  assert.equal(parseAnswerWord('maybe'), null);
  assert.equal(parseAnswerWord('yes no'), null);
  assert.equal(parseAnswerWord(''), null);
});

test('parseAnswerWord accepts natural single-word yes/no variants', () => {
  assert.equal(parseAnswerWord('nope'), 'no');
  assert.equal(parseAnswerWord('Nah.'), 'no');
  assert.equal(parseAnswerWord('yeah'), 'yes');
  assert.equal(parseAnswerWord('yep!'), 'yes');
  assert.equal(parseAnswerWord('YUP'), 'yes');
  assert.equal(parseAnswerWord('nope no'), null);
});

test('the listen window matches the requested 12 seconds', () => {
  assert.equal(VOICE_LISTEN_SEC, 12);
  assert.deepEqual([...ANSWER_WORDS], ['yes', 'no']);
});

const script = await load('../../src/voice-lab/lab-script.ts');
const { buildGestureLabScript, labPromptById, labAnswerFollowUp, labBranchIsNextPromptLine } = script;
const tree = buildGestureLabScript(
  { clipId: 'intro-voice', text: 'intro line' },
  { clipId: 'retry-voice', text: 'retry line' },
);

test('dialogue tree: intro no goes to the short retry loop, branches converge at q3 then end', () => {
  const p = labPromptById(tree, 'intro');
  assert.equal(labAnswerFollowUp(p, 'no').branch.clipId, 'retry-voice');
  assert.equal(labAnswerFollowUp(p, 'no').nextPromptId, 'retry');
  const retryPrompt = labPromptById(tree, 'retry');
  assert.equal(labAnswerFollowUp(retryPrompt, 'no').nextPromptId, 'retry');
  assert.equal(labAnswerFollowUp(retryPrompt, 'yes').nextPromptId, 'q2');
  assert.equal(labAnswerFollowUp(p, 'yes').nextPromptId, 'q2');
  for (const answer of ['yes', 'no']) {
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q2'), answer).nextPromptId, 'q3');
    assert.equal(labAnswerFollowUp(labPromptById(tree, 'q3'), answer).nextPromptId, 'end');
  }
});

test('voice lab shares the shared lines and retry rotation with the gesture labs', () => {
  const retryPrompt = labPromptById(tree, 'retry');
  assert.equal(retryPrompt.loopVariations?.length, 4);
  assert.deepEqual(
    retryPrompt.loopVariations?.map((line) => line.clipId),
    ['retry-voice', 'retry-2', 'retry-3', 'retry-4'],
  );
  const p = labPromptById(tree, 'intro');
  for (const answer of ['yes', 'no']) {
    const follow = labAnswerFollowUp(p, answer);
    assert.equal(labBranchIsNextPromptLine(tree, follow.branch, follow.nextPromptId), true);
  }
});

test('canon guard: voice lab fiction is barely-hearing, never game surveillance', () => {
  const src = readFileSync(new URL('../../src/voice-lab/voice-lab-system.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../../src/voice-lab/lab-script.ts', import.meta.url), 'utf8')
    + readFileSync(new URL('../../src/voice-lab/voice-receiver.ts', import.meta.url), 'utf8');
  assert.ok(!/game is listening/i.test(src));
  assert.ok(/barely hear/i.test(src));
  // The lab fiction premise is flagged as lab-only in the research doc.
  const doc = readFileSync(new URL('../../docs/VOICE_LAB_RESEARCH.md', import.meta.url), 'utf8');
  assert.ok(/lab-only|lab only/i.test(doc));
});

test('voice-lab-only lines are owner-approved and match the clip spec word for word', () => {
  const system = readFileSync(new URL('../../src/voice-lab/voice-lab-system.ts', import.meta.url), 'utf8');
  const spec = readFileSync(new URL('../../docs/CYPHER_LAB_CLIPS.md', import.meta.url), 'utf8');
  // Approved 2026-11-19 (intro-voice reworded to "This channel is weak");
  // the spec section must no longer mark the six lines as drafts.
  const start = spec.indexOf('### Voice yes/no lab lines');
  const section = spec.slice(start, spec.indexOf('## Canon constraints', start));
  assert.ok(!/DRAFT|pending Oded's review/i.test(section));
  // The approved intro wording is what the system speaks and captions.
  assert.ok(system.includes('This channel is weak.'));
  // Every voice-lab-only clip id used by the system is specced, word for word.
  for (const m of system.matchAll(/clipId: '(intro-voice|retry-voice|noise-[1-4])',\s*\n?\s*text: '([^']+)'/g)) {
    assert.ok(spec.includes(`\`${m[1]}\``), `spec lists ${m[1]}`);
    assert.ok(spec.includes(`| ${m[2]} |`), `spec text matches ${m[1]}`);
  }
  // The six approved ids exist exactly once each in the spec table.
  for (const id of ['intro-voice', 'retry-voice', 'noise-1', 'noise-2', 'noise-3', 'noise-4']) {
    assert.equal(spec.split(`\`${id}\``).length - 1, 1, id);
  }
});


test('wiring: registry entry, menu row, mode, panel asset, scene nodes and registration', () => {
  const registry = readFileSync(new URL('../../src/lab-menu/lab-registry.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../public/ui/lab-menu.uikitml', import.meta.url), 'utf8');
  const appMode = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../../src/assets.ts', import.meta.url), 'utf8');
  const mainScene = readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8');
  const arScene = readFileSync(new URL('../../public/scenes/wall-tones-ar.iwsdk.scene.json', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../../src/wall-tones/world-host.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../../public/ui/voice-lab.uikitml', import.meta.url), 'utf8');
  assert.ok(registry.includes("{ id: 'voice', label: 'Voice Yes/No Lab', mode: 'voicelab', available: true }"));
  assert.ok(menu.includes('id="lab-row-voice-button"'));
  assert.ok(menu.includes('id="lab-row-voice-label"'));
  assert.ok(appMode.includes("'voicelab'"));
  assert.ok(appMode.includes("setNodeVisible('voice-lab-panel'"));
  assert.ok(appMode.includes("getElementById('voice-lab-back-button')"));
  assert.ok(assets.includes("'voice-lab-panel': uikitml('voice-lab.uikitml'"));
  assert.ok(mainScene.includes('"id": "voice-lab-panel"'));
  assert.ok(arScene.includes('"id": "voice-lab-panel"'));
  assert.ok(host.includes('VoiceLabSystem'));
  // Both register call sites (hub and AR) register the voice lab.
  assert.equal(host.split('world.registerSystem(VoiceLabSystem)').length - 1, 2);
  for (const id of ['voice-lab-status', 'voice-lab-line', 'voice-lab-telemetry', 'voice-lab-voice',
    'voice-lab-heard', 'voice-lab-start-button', 'voice-lab-yes-button', 'voice-lab-no-button',
    'voice-lab-skip-button', 'voice-lab-repeat-button', 'voice-lab-back-button']) {
    assert.ok(panel.includes(`id="${id}"`), id);
  }
  for (const id of ['voice-lab-status', 'voice-lab-line', 'voice-lab-telemetry', 'voice-lab-voice',
    'voice-lab-heard', 'voice-lab-start-label']) {
    assert.ok(panel.match(new RegExp(`id="${id}"[^>]*>[^<]`)), `seeded ${id}`);
  }
});

test('vendored model and scripts ship under public/voice-lab and load same-origin', () => {
  const receiverSrc = readFileSync(new URL('../../src/voice-lab/voice-receiver.ts', import.meta.url), 'utf8');
  assert.ok(receiverSrc.includes('voice-lab/vendor/'));
  assert.ok(receiverSrc.includes('voice-lab/model/'));
  assert.ok(!receiverSrc.includes('https://'), 'no remote model or script URLs');
  for (const f of ['model/model.json', 'model/metadata.json',
    'model/group1-shard1of2', 'model/group1-shard2of2',
    'vendor/tf.min.js', 'vendor/speech-commands.min.js']) {
    readFileSync(new URL(`../../public/voice-lab/${f}`, import.meta.url));
  }
});
