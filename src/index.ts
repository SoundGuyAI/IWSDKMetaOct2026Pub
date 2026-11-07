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
const startup = window as unknown as {
  __wtLoading?: LoadingStatus;
  __wtBeforeReady?: () => void;
  __wtFinishLoading?: () => void;
};
// Build identity for testers; the Settings menu shows the same string.
(window as unknown as { __wallTonesBuildInfo?: unknown }).__wallTonesBuildInfo = {
  version: __WALL_TONES_VERSION__,
  commit: __WALL_TONES_COMMIT__,
};

const loading = startup.__wtLoading;
const container = document.getElementById('scene-container') as HTMLDivElement;
const gate = document.getElementById('audio-start-gate') as HTMLDivElement;
const start = document.getElementById('audio-start-button') as HTMLButtonElement;

if (needsExplicitMobileSoundUnlock()) {
  // Scene and fonts can load with suspended audio. Reveal the native sound
  // gesture only after the menu's fonts and first readable frame are ready.
  prepareMobileWelcome();
  startup.__wtBeforeReady = () => {
    loading?.waitForGesture();
    gate.hidden = false;
  };
  start.addEventListener('click', () => {
    start.disabled = true;
    try {
      // Both calls must happen in this real tap, with no preceding await.
      const welcomeStarted = startMobileWelcomeFromGesture();
      unlockSpeechFromGesture();
      void welcomeStarted.catch((error) => {
        console.warn('[wall-tones] welcome playback unavailable', error);
      });
      gate.remove();
      startup.__wtBeforeReady = undefined;
      startup.__wtFinishLoading?.();
    } catch (error) {
      // Narration must never trap a loaded game. Later Sound on / pad gestures
      // remain available if this device rejects the optional welcome clip.
      console.warn('[wall-tones] sound start unavailable', error);
      gate.remove();
      startup.__wtBeforeReady = undefined;
      startup.__wtFinishLoading?.();
    }
  });
} else {
  gate.remove();
}
loading?.stage('world', 'Game code loaded. Loading scene assets and creating the renderer.');
void startInitialWorld(container).catch((error) => {
  console.error('[wall-tones] startup failed', error);
  loading?.fail(error);
});
