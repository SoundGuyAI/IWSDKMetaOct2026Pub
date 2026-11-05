/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { startInitialWorld } from './wall-tones/world-host.js';
import { needsExplicitMobileSoundUnlock, ensureAudioRunning } from './wall-tones/audio.js';
import { unlockSpeechFromGesture } from './wall-tones/speech.js';

const container = document.getElementById('scene-container') as HTMLDivElement;
const gate = document.getElementById('audio-start-gate') as HTMLDivElement;
const start = document.getElementById('audio-start-button') as HTMLButtonElement;

if (needsExplicitMobileSoundUnlock()) {
  // A real HTML button before the 3D menu: Safari activation must happen in
  // this trusted click, never in a spatial UI callback on a later frame.
  gate.hidden = false;
  start.addEventListener('click', async () => {
    start.disabled = true;
    try {
      unlockSpeechFromGesture(); // resumes Web Audio and primes HTML audio now
      const context = await ensureAudioRunning();
      if (context == null) {
        start.disabled = false; // stay on the gate and allow another real tap
        return;
      }
      await startInitialWorld(container);
      gate.remove();
    } catch (error) {
      console.error('[wall-tones] startup failed', error);
      start.disabled = false;
    }
  });
} else {
  gate.remove();
  void startInitialWorld(container);
}
