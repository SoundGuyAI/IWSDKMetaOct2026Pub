/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

import { startInitialWorld } from './wall-tones/world-host.js';
import { needsExplicitMobileSoundUnlock } from './wall-tones/audio.js';
import { unlockSpeechFromGesture, prepareMobileWelcome, startMobileWelcomeFromGesture } from './wall-tones/speech.js';

type LoadingStatus = {
  stage: (key: string, detail: string) => void;
  waitForGesture: () => void;
  fail: (error: unknown) => void;
};
const loading = (window as unknown as { __wtLoading?: LoadingStatus }).__wtLoading;
loading?.stage('gesture', 'Game code loaded. Checking whether sound needs a tap.');

const container = document.getElementById('scene-container') as HTMLDivElement;
const gate = document.getElementById('audio-start-gate') as HTMLDivElement;
const start = document.getElementById('audio-start-button') as HTMLButtonElement;

if (needsExplicitMobileSoundUnlock()) {
  // A real HTML button before the 3D menu: Safari activation must happen in
  // this trusted click, never in a spatial UI callback on a later frame.
  loading?.waitForGesture();
  prepareMobileWelcome();
  gate.hidden = false;
  start.addEventListener('click', async () => {
    start.disabled = true;
    // The gesture must remain accessible above the splash until this tap.
    // Hide it only after activation; loading diagnostics are underneath.
    gate.hidden = true;
    loading?.stage('world', 'Loading scene assets and creating the renderer.');
    try {
      // Start the real voice clip in this click, before async world startup or
      // Web Audio work can lose Safari's transient user activation.
      const welcomeStarted = startMobileWelcomeFromGesture();
      unlockSpeechFromGesture();
      // Narration is optional. A missing/blocked clip must not trap the player
      // outside the game; the normal Sound on / pad gestures remain available.
      void welcomeStarted.catch((error) => {
        console.warn('[wall-tones] welcome playback unavailable', error);
      });
      await startInitialWorld(container);
      gate.remove();
    } catch (error) {
      console.error('[wall-tones] startup failed', error);
      loading?.fail(error);
    }
  });
} else {
  gate.remove();
  loading?.stage('world', 'Loading scene assets and creating the renderer.');
  void startInitialWorld(container).catch((error) => loading?.fail(error));
}
