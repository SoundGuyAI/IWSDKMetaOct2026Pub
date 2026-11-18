import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { COMMANDS, classify, parseCommand, speechError } from '../../public/voice-lab/logic.js';

const read = (p) => readFileSync(new URL('../../public/voice-lab/' + p, import.meta.url), 'utf8');

test('workbench accepts only yes/no/left/right at or above threshold', () => {
  const labels = ['_unknown_', 'yes', 'stop', 'left'];
  assert.deepEqual(classify(labels, [0.1, 0.85, 0.03, 0.02], 0.8), { word: 'yes', top: 'yes', score: 0.85 });
  // 'stop' is a real model word but not a wired command: top class shown, rejected.
  assert.deepEqual(classify(labels, [0.1, 0.2, 0.9, 0.05], 0.8).word, null);
  assert.equal(classify(labels, [0.1, 0.2, 0.9, 0.05], 0.8).top, 'stop');
  // Below-threshold top class is rejected.
  assert.equal(classify(labels, [0.1, 0.7, 0.15, 0.05], 0.8).word, null);
  // Background noise / unknown are never commands.
  assert.equal(classify(['_background_noise_', 'no'], [0.99, 0.01], 0.8).word, null);
  assert.equal(COMMANDS.length, 4);
});

test('classify rejects malformed input instead of guessing', () => {
  assert.deepEqual(classify([], [], 0.8).top, 'invalid');
  assert.equal(classify(['yes'], [0.9, 0.1], 0.8).top, 'invalid');
  assert.equal(classify(['yes'], [Number.NaN], 0.8).top, 'invalid');
});

test('browser speech transcripts are parsed to commands conservatively', () => {
  assert.equal(parseCommand('Yes.'), 'yes');
  assert.equal(parseCommand('  NO '), 'no');
  assert.equal(parseCommand('left,'), 'left');
  assert.equal(parseCommand('go left'), null);
  assert.equal(parseCommand('stop'), null);
});

test('speech errors map to plain-language guidance', () => {
  assert.match(speechError('not-allowed'), /permission/i);
  assert.match(speechError('no-speech'), /no speech/i);
  assert.match(speechError('something-new'), /something-new/);
});

test('page wires the vendored model and libraries from the same origin', () => {
  const html = read('index.html');
  assert.ok(html.includes('./vendor/tf.min.js'), 'vendored tf.js script tag');
  assert.ok(html.includes('./vendor/speech-commands.min.js'), 'vendored speech-commands script tag');
  assert.ok(html.includes('./app.js'), 'module entry');
  const receiver = read('receiver.js');
  assert.ok(receiver.includes("'./model/model.json'"), 'same-origin model URL');
  assert.ok(receiver.includes("'./model/metadata.json'"), 'same-origin metadata URL');
  assert.ok(receiver.includes("'BROWSER_FFT'"), '18w browser FFT model config');
});

test('vendored assets are present, pinned and plausible', () => {
  const meta = JSON.parse(read('model/metadata.json'));
  assert.equal(meta.words.length, 20, '18 words plus noise and unknown classes');
  for (const word of ['yes', 'no', 'left', 'right', 'stop', '_background_noise_', '_unknown_']) {
    assert.ok(meta.words.includes(word), `metadata lists ${word}`);
  }
  const model = JSON.parse(read('model/model.json'));
  for (const shard of model.weightsManifest[0].paths) {
    const stat = statSync(new URL('../../public/voice-lab/model/' + shard, import.meta.url));
    assert.ok(stat.size > 1000000, `${shard} is a real weight shard`);
  }
  assert.match(read('vendor/NOTICES.txt'), /@tensorflow\/tfjs@4\.22\.0/);
  assert.match(read('vendor/NOTICES.txt'), /speech-commands@0\.5\.4/);
  assert.ok(statSync(new URL('../../public/voice-lab/vendor/tf.min.js', import.meta.url)).size > 1000000);
  assert.ok(statSync(new URL('../../public/voice-lab/vendor/speech-commands.min.js', import.meta.url)).size > 10000);
});
