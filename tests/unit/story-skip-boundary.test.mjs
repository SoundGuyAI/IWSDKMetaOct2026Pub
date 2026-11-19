import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the actual queued round callback and story method. Only timing/audio
// and UI are controlled; the segment guards and persisted progress are real.
const source = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const roundStart = source.indexOf('const completedRunId =', source.indexOf('private finishCompletedPattern'));
const roundEnd = source.indexOf('\n});', roundStart) + 4;
const round = new Function('streak', 'increasedRecord', 'previousBest', 'explainBars', 'randomNewBestClip', 'milestoneClipFor', 'randomCheerClip', 'BETWEEN_ROUNDS_DELAY_S', 'palmProjectorPromptDue', 'VisibilityState', 'armbandDisplayMode', 'captureCypherCast', 'getVoiceGender', transpile(source.slice(roundStart, roundEnd)));
const windowStart = source.indexOf('const cast = captureCypherCast(getVoiceGender());', source.indexOf('private async playCypherWindow'));
const windowEnd = source.indexOf('\n}\n\n/** A small fictional', windowStart);
const playWindow = new AsyncFunction('window', 'intact', 'captureCypherCast', 'getVoiceGender', transpile(source.slice(windowStart, windowEnd)));
const progressSource = readFileSync(new URL('../../src/wall-tones/cypher-progress.ts', import.meta.url), 'utf8');
const { CypherProgress } = await import('data:text/javascript;base64,' + Buffer.from(transpile(progressSource)).toString('base64'));
function harness({ next = 1, active = { index: 0, offset: 0 }, hook = () => {} } = {}) {
  const storage = new Map([['wall-tones-cypher-act1-progress-v1', JSON.stringify({ version: 1, next, active })]]);
  const events = [];
  const c = { game: { runId: 7, phase: 'playback' }, narrationInterrupt: 0, experienceActive: true, flowPhase: 'playing', playbackQueue: Promise.resolve(),
    cypherProgress: new CypherProgress({ getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }),
    world: { visibilityState: { peek: () => 0 } }, economy: { takeFirstTime: () => false }, backgroundProgress: { successfulPattern: () => undefined },
    wait: async () => { await hook('wait', c); }, renderPanel() {}, setCypherSeam() {},
    playSequence: async () => { events.push('pattern'); },
  };
  c.skip = () => { c.narrationInterrupt++; };
  c.speech = { isBusy: () => false,
    speakAsync: async id => { events.push(id); await hook(id, c); },
    speakStoryEffect: async id => { events.push('effect:' + id); await hook('effect:' + id, c); },
    speakStoryLine: async (id, cast, started) => { started?.(); events.push(id); await hook(id, c); },
  };
  c.playCypherWindow = (w, intact) => playWindow.call(c, w, intact, () => ({}), () => 'female');
  c.round = async (streak = 6, praise = true) => { round.call(c, streak, praise, 0, false, () => 'record', () => 'milestone', () => 'cheer', 0, () => false, { NonImmersive: 0 }, () => '', () => ({}), () => 'female'); await c.playbackQueue; };
  return { c, events, saved: () => JSON.parse(storage.get('wall-tones-cypher-act1-progress-v1')) };
}
test('praise Skip cancels remaining praise but starts story at the same boundary', async () => {
  const h = harness({ hook: (id, c) => { if (id === 'record') c.skip(); } });
  await h.c.round();
  assert.deepEqual(h.events, ['record', 'effect:open', 'C01', 'effect:close', 'pattern']);
  assert.deepEqual(h.saved(), { version: 1, next: 1 });
});
test('story Skip consumes only the started line and defers unstarted lines', async () => {
  const h = harness({ next: 6, active: { index: 5, offset: 0 }, hook: (id, c) => { if (id === 'C05') c.skip(); } });
  await h.c.round(10, false);
  assert.ok(h.events.includes('C05')); assert.ok(!h.events.includes('C06'));
  assert.deepEqual(h.saved().active, { index: 5, offset: 1 });
  await h.c.round(11, false);
  assert.equal(h.events.filter(x => x === 'C05').length, 1);
  assert.equal(h.events.filter(x => x === 'C06').length, 1);
  assert.equal(h.saved().active, undefined);
});
test('repeated praise Skip cannot swallow story; a later story Skip still stops its segment', async () => {
  const h = harness({ hook: (id, c) => { if (id === 'record' || id === 'C01') { c.skip(); c.skip(); } } });
  await h.c.round();
  assert.deepEqual(h.events, ['record', 'effect:open', 'C01', 'pattern']);
  await h.c.round(7, false); assert.ok(h.events.includes('C02'));
});
test('Skip in pre-line effect leaves the line unheard until next boundary', async () => {
  let once = true;
  const h = harness({ hook: (id, c) => { if (id === 'effect:open' && once) { once = false; c.skip(); } } });
  await h.c.round(6, false); assert.ok(!h.events.includes('C01'));
  assert.deepEqual(h.saved().active, { index: 0, offset: 0 });
  await h.c.round(7, false); assert.ok(h.events.includes('C01'));
});
for (const point of ['record', 'effect:open', 'C01']) {
  for (const change of ['leave', 'reenter', 'newrun', 'failure']) {
    test(`${change} during ${point} prevents stale story/pattern continuation`, async () => {
      const h = harness({ hook: (id, c) => { if (id !== point) return; c.skip();
        if (change === 'leave') { c.experienceActive = false; c.flowPhase = 'inactive'; }
        else if (change === 'failure') c.game.phase = 'resetting';
        else { c.game.runId++; c.experienceActive = true; c.flowPhase = 'playing'; }
      } });
      await h.c.round(); assert.ok(!h.events.includes('pattern'));
      if (point !== 'C01') assert.ok(!h.events.includes('C01'));
    });
  }
}
test('queued callback from an old run cannot start narration', async () => {
  let release; const h = harness(); h.c.playbackQueue = new Promise(r => { release = r; });
  const done = h.c.round(); h.c.game.runId++; release(); await done; assert.deepEqual(h.events, []);
});
