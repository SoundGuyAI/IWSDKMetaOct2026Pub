import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  gazePinchMode,
  headGazePinchEnabled,
  nativeGazePinchEnabled,
  setGazePinchMode,
  setHeadGazePinch,
  setNativeGazePinch,
} from '../../src/wall-tones/accessibility.js';
import {
  classifyGazeSource,
  gazeSourceStatusText,
  GAZE_HEAD_DIRECTED_AFTER_S,
  GAZE_SEPARATION_DEG,
} from '../../src/wall-tones/gaze-source.js';

// Backlog 77+79: the head-gaze + pinch pad press path is optional
// (Settings > Accessibility) and defaults OFF (Oded, 2026-11-15 02:34).

test('gaze+pinch toggle row exists in markup and is wired in app-mode', () => {
  const menu = readFileSync('public/ui/main-menu.uikitml', 'utf8');
  expect(menu).toContain('id="head-gaze-pinch-row"');
  expect(menu).toContain('id="head-gaze-pinch-checkbox"');
  const appMode = readFileSync('src/app-mode.ts', 'utf8');
  expect(appMode).toContain("'head-gaze-pinch-row'");
  expect(appMode).toContain('headGazePinchEnabled');
  const system = readFileSync('src/wall-tones/wall-tones-system.ts', 'utf8');
  // The gate must sit inside readRayAndGazeTouches, before the gaze ray cast,
  // and must run the custom head reader ONLY in the explicit head mode.
  const reader = system.slice(system.indexOf('private readRayAndGazeTouches'));
  const gate = reader.indexOf("gazePinchMode() !== 'head'");
  const gazeCast = reader.indexOf('findGazeHoveredPad()');
  expect(gate).toBeGreaterThan(-1);
  expect(gazeCast).toBeGreaterThan(gate);
});

test('gaze+pinch setting defaults OFF and flips via the setter', () => {
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: new EventTarget() });
  try {
    expect(headGazePinchEnabled()).toBe(false);
    setHeadGazePinch(true);
    expect(headGazePinchEnabled()).toBe(true);
    setHeadGazePinch(false);
    expect(headGazePinchEnabled()).toBe(false);
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
});

test('native eye-gaze row, status line and app-mode wiring exist', () => {
  const menu = readFileSync('public/ui/main-menu.uikitml', 'utf8');
  expect(menu).toContain('id="native-gaze-pinch-row"');
  expect(menu).toContain('id="native-gaze-pinch-checkbox"');
  expect(menu).toContain('id="native-gaze-status"');
  const appMode = readFileSync('src/app-mode.ts', 'utf8');
  expect(appMode).toContain("'native-gaze-pinch-row'");
  expect(appMode).toContain('nativeGazePinchEnabled');
  expect(appMode).toContain('GAZE_SOURCE_EVENT');
  const system = readFileSync('src/wall-tones/wall-tones-system.ts', 'utf8');
  // The native pipeline is driven only by the explicit mode, and overrides
  // the GazeSystem startup default.
  expect(system).toContain("this.input.xr.gazeEnabled = gazePinchMode() === 'native'");
  expect(system).toContain('applyGazePinchMode();');
  expect(system).toContain('classifyGazeSource(');
});

test('gaze+pinch is one explicit three-way mode, default off, no silent switching', () => {
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: new EventTarget() });
  try {
    expect(gazePinchMode()).toBe('off');
    expect(headGazePinchEnabled()).toBe(false);
    expect(nativeGazePinchEnabled()).toBe(false);
    // Head and native are mutually exclusive choices by the player.
    setHeadGazePinch(true);
    expect(gazePinchMode()).toBe('head');
    expect(nativeGazePinchEnabled()).toBe(false);
    setNativeGazePinch(true);
    expect(gazePinchMode()).toBe('native');
    expect(headGazePinchEnabled()).toBe(false);
    setNativeGazePinch(false);
    expect(gazePinchMode()).toBe('off');
    setGazePinchMode('head');
    expect(gazePinchMode()).toBe('head');
    setGazePinchMode('off');
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
});

test('gaze source classification names each real supply state accurately', () => {
  // Not in VR yet.
  expect(classifyGazeSource(false, false, 0, 0)).toBe('no-session');
  // In VR but the headset hands over no gaze input source.
  expect(classifyGazeSource(false, true, 0, 30)).toBe('unavailable');
  // Gaze ray separates from the head ray: real eye tracking.
  expect(classifyGazeSource(true, true, GAZE_SEPARATION_DEG, 1)).toBe('tracked');
  // Never separates, after the watch window: head-directed stand-in.
  expect(classifyGazeSource(true, true, GAZE_SEPARATION_DEG - 1, GAZE_HEAD_DIRECTED_AFTER_S)).toBe('head-directed');
  // Still inside the watch window with no verdict.
  expect(classifyGazeSource(true, true, 0, 1)).toBe('checking');
  // Every status has player-facing text that says what it means.
  for (const status of ['no-session', 'unavailable', 'tracked', 'head-directed', 'checking'] as const) {
    expect(gazeSourceStatusText(status).length).toBeGreaterThan(0);
  }
  expect(gazeSourceStatusText('head-directed')).toContain('head direction');
});
