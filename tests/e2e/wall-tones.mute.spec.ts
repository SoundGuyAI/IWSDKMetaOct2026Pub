import { expect, test } from '@playwright/test';
import { AppModeSystem } from '../../src/app-mode.js';
import { startMobileWelcomeFromGesture } from '../../src/wall-tones/speech.js';
import { setVoicesOff } from '../../src/wall-tones/accessibility.js';

// These preference paths must not depend on WebGL or a running audio device.
test('muted mobile welcome returns before constructing or playing Audio', async () => {
  const previousWindow = globalThis.window;
  const previousAudio = globalThis.Audio;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'iPhone', maxTouchPoints: 1, platform: 'iPhone' } });
  let constructed = 0;
  Object.assign(globalThis, {
    window: new EventTarget(),
    Audio: class { constructor() { constructed++; throw new Error('muted welcome must not create audio'); } },
  });
  try {
    setVoicesOff(true);
    await startMobileWelcomeFromGesture();
    expect(constructed).toBe(0);
  } finally {
    setVoicesOff(false);
    Object.assign(globalThis, { window: previousWindow, Audio: previousAudio });
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as any).navigator;
  }
});

test('Voices off cancels the menu preview and listener cleanup stops further calls', () => {
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: new EventTarget() });
  let cancels = 0;
  const cleanupFuncs: Array<() => void> = [];
  const context = { voicePreview: { cancel: () => { cancels++; } }, cleanupFuncs };
  const panel = { getElementById: () => ({ setProperties() {}, addEventListener() {}, removeEventListener() {} }) };
  try {
    setVoicesOff(false);
    (AppModeSystem.prototype as any).bindSettingsMenu.call(context, panel);
    window.dispatchEvent(new Event('wall-tones-accessibility-change'));
    expect(cancels).toBe(0);
    setVoicesOff(true);
    expect(cancels).toBe(1);
    cleanupFuncs.forEach(cleanup => cleanup());
    setVoicesOff(true);
    expect(cancels).toBe(1);
  } finally {
    cleanupFuncs.forEach(cleanup => cleanup());
    setVoicesOff(false);
    Object.assign(globalThis, { window: previousWindow });
  }
});
