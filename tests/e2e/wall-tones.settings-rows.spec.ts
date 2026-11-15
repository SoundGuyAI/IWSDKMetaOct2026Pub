import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { AppModeSystem } from '../../src/app-mode.js';
import {
  hearingSubtitlesEnabled,
  colorNamesEnabled,
  voicesOffEnabled,
  headGazePinchEnabled,
  setHearingSubtitles,
  setColorNames,
  setVoicesOff,
  setHeadGazePinch,
} from '../../src/wall-tones/accessibility.js';

// Backlog 78: settings rows toggle on whole-row press, not just the checkbox.

// Screen coordinates below are measured at 1280x720 (same as the pointer spec).
test.use({ viewport: { width: 1280, height: 720 } });

type MockElement = {
  props: Record<string, unknown>;
  listeners: Record<string, Array<(event: unknown) => void>>;
  setProperties(props: Record<string, unknown>): void;
  addEventListener(type: string, fn: (event: unknown) => void): void;
  click(event?: unknown): void;
};

function mockPanel() {
  const elements = new Map<string, MockElement>();
  const panel = {
    getElementById(id: string): MockElement | undefined {
      let el = elements.get(id);
      if (el == null) {
        el = {
          props: {},
          listeners: {},
          setProperties(props: Record<string, unknown>) {
            Object.assign(this.props, props);
          },
          addEventListener(type: string, fn: (event: unknown) => void) {
            (this.listeners[type] ??= []).push(fn);
          },
          click(event: unknown = {}) {
            for (const fn of this.listeners['click'] ?? []) fn(event);
          },
        };
        elements.set(id, el);
      }
      return el;
    },
  };
  return { panel, elements };
}

function bind(panel: unknown) {
  const context = {
    voicePreview: { cancel() {} },
    cleanupFuncs: [] as Array<() => void>,
  };
  (AppModeSystem.prototype as never as { bindSettingsMenu(p: unknown): void }).bindSettingsMenu.call(
    context,
    panel,
  );
}

test('accessibility rows carry ids and pointer cursor around their checkboxes', () => {
  const menu = readFileSync('public/ui/main-menu.uikitml', 'utf8');
  for (const [rowId, checkboxId] of [
    ['hearing-subtitles-row', 'hearing-subtitles-checkbox'],
    ['color-names-row', 'color-names-checkbox'],
    ['voices-off-row', 'voices-off-checkbox'],
    ['head-gaze-pinch-row', 'head-gaze-pinch-checkbox'],
  ]) {
    const row = new RegExp(
      `<div id="${rowId}" style="[^"]*cursor: pointer[^"]*">\\s*<Checkbox id="${checkboxId}">`,
    );
    expect(menu, `${rowId} wraps ${checkboxId} with pointer cursor`).toMatch(row);
  }
});

test('whole-row press toggles each accessibility setting once per click', () => {
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: new EventTarget() });
  const { panel, elements } = mockPanel();
  try {
    setHearingSubtitles(false);
    setColorNames(false);
    setVoicesOff(false);
    setHeadGazePinch(false);
    bind(panel);

    elements.get('hearing-subtitles-row')!.click();
    expect(hearingSubtitlesEnabled()).toBe(true);
    elements.get('hearing-subtitles-row')!.click();
    expect(hearingSubtitlesEnabled()).toBe(false);

    elements.get('color-names-row')!.click();
    expect(colorNamesEnabled()).toBe(true);
    elements.get('voices-off-row')!.click();
    expect(voicesOffEnabled()).toBe(true);
    elements.get('head-gaze-pinch-row')!.click();
    expect(headGazePinchEnabled()).toBe(true);
    elements.get('head-gaze-pinch-row')!.click();
    expect(headGazePinchEnabled()).toBe(false);
  } finally {
    setHearingSubtitles(false);
    setColorNames(false);
    setVoicesOff(false);
    setHeadGazePinch(false);
    Object.assign(globalThis, { window: previousWindow });
  }
});

test('real mouse press on the row label toggles the setting (1280x720)', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.localStorage.removeItem('wall-tones-hearing-subtitles');
  });
  await page.goto('/');
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForTimeout(8_000); // hub scene + uikit panel warmup

  // uikit panel click: hover dwell so the ray registers, then a still press.
  const panelClick = async (x: number, y: number, dwellMs = 800) => {
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(dwellMs);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
  };
  const readSetting = () =>
    page.evaluate(() => window.localStorage.getItem('wall-tones-hearing-subtitles'));

  // Coordinates measured from a screenshot of this build: Settings button,
  // Accessibility button, then the subtitles row LABEL (not the checkbox).
  const SETTINGS: [number, number] = [640, 458];
  const ACCESSIBILITY: [number, number] = [640, 407];
  const ROW_LABEL: [number, number] = [560, 95];

  const MAX_ROUNDS = 3;
  let rounds = 0;
  let value = await readSetting();
  while (value !== 'true' && rounds < MAX_ROUNDS) {
    rounds += 1;
    await panelClick(...SETTINGS);
    await page.waitForTimeout(1_200);
    await panelClick(...ACCESSIBILITY);
    await page.waitForTimeout(1_200);
    await panelClick(...ROW_LABEL);
    await page.waitForTimeout(1_200);
    value = await readSetting();
  }
  testInfo.annotations.push({
    type: 'row-click-rounds',
    description: `row toggle took ${rounds} click round(s)`,
  });
  await testInfo.attach('accessibility-final', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(value, `row label press must toggle within ${MAX_ROUNDS} rounds`).toBe('true');

  // A press on the checkbox itself toggles exactly once (no double-toggle).
  const CHECKBOX: [number, number] = [405, 95];
  await panelClick(...CHECKBOX);
  await page.waitForTimeout(1_200);
  expect(await readSetting(), 'checkbox press must toggle back exactly once').toBe('false');
});

test('checkbox click stops propagation so a box press cannot double-toggle', () => {
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: new EventTarget() });
  const { panel, elements } = mockPanel();
  try {
    setHearingSubtitles(false);
    bind(panel);
    const checkbox = elements.get('hearing-subtitles-checkbox')!;
    // uikit bubbles target -> ancestors; the checkbox listener must stop the
    // bubble before the row handler runs, or one press toggles twice.
    let stopped = false;
    checkbox.click({ stopPropagation: () => { stopped = true; } });
    expect(stopped).toBe(true);
    // The checkbox stays controlled: its onCheckedChange drives the setting.
    const onCheckedChange = checkbox.props['onCheckedChange'] as (v: boolean) => void;
    expect(typeof onCheckedChange).toBe('function');
    onCheckedChange(true);
    expect(hearingSubtitlesEnabled()).toBe(true);
    // Controlled flow: the accessibility-change event syncs checked back in.
    expect(checkbox.props['checked']).toBe(true);
  } finally {
    setHearingSubtitles(false);
    Object.assign(globalThis, { window: previousWindow });
  }
});
