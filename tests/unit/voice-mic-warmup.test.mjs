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

const receiverModule = await load('../../src/voice-lab/voice-receiver.ts');
const { VoiceReceiver } = receiverModule;
const systemSrc = readFileSync(
  new URL('../../src/voice-lab/voice-lab-system.ts', import.meta.url),
  'utf8',
);

const realNavigator = globalThis.navigator;
const setNavigator = (value) => {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
};
test.after(() => setNavigator(realNavigator));

test('warmMicrophone grants, stops every track, and stays a one-time prompt', async () => {
  let calls = 0;
  const stopped = [];
  setNavigator({
    mediaDevices: {
      getUserMedia: async () => {
        calls += 1;
        return {
          getTracks: () => [
            { stop: () => stopped.push('a') },
            { stop: () => stopped.push('b') },
          ],
        };
      },
    },
  });
  const receiver = new VoiceReceiver();
  assert.equal(await receiver.warmMicrophone(), 'granted');
  assert.deepEqual(stopped, ['a', 'b'], 'every track is stopped right away');
  assert.equal(await receiver.warmMicrophone(), 'granted');
  assert.equal(calls, 1, 'a granted warm-up is idempotent, no second prompt');
  assert.equal(receiver.micWarmupState(), 'granted');
  assert.match(receiver.describe(), /mic granted/);
});

test('warmMicrophone denial resolves denied without throwing', async () => {
  setNavigator({
    mediaDevices: {
      getUserMedia: async () => {
        throw new Error('NotAllowedError');
      },
    },
  });
  const receiver = new VoiceReceiver();
  assert.equal(await receiver.warmMicrophone(), 'denied');
  assert.equal(receiver.micWarmupState(), 'denied');
  assert.match(receiver.describe(), /mic denied/);
});

test('warmMicrophone without mediaDevices resolves unsupported', async () => {
  setNavigator({});
  const receiver = new VoiceReceiver();
  assert.equal(await receiver.warmMicrophone(), 'unsupported');
});

test('the system warms the mic at game start and lab-menu open, not mid-question', () => {
  const warmBlock = systemSrc.match(
    /if \(mode === 'walltones' \|\| mode === 'lab' \|\| mode === 'voicelab'\) \{\s*void this\.receiver\.warmMicrophone\(\);/,
  );
  assert.ok(warmBlock, 'experience-mode-changed warms the mic on the three early modes');
  const restoreBlock = systemSrc.match(
    /restoredMode === 'walltones' \|\|\s*\n?\s*restoredMode === 'lab' \|\|\s*\n?\s*restoredMode === 'voicelab'/,
  );
  assert.ok(restoreBlock, 'the session-restore path warms the mic too');
});
