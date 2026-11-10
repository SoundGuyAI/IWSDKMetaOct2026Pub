import { readFileSync } from 'node:fs';

import { shouldAnnounceRecord } from '../../src/wall-tones/record-feedback.js';
import { expect, test } from '@playwright/test';
import { NEW_BEST_MALE } from '../../src/wall-tones/new-best-male.js';
import { NEW_BEST_FEMALE } from '../../src/wall-tones/new-best-female.js';
import { WallTonesSequence } from '../../src/wall-tones/sequence.js';

test('both voices contain all three approved playable new-best recordings', () => {
  for (const clips of [NEW_BEST_MALE, NEW_BEST_FEMALE]) {
    expect(Object.keys(clips)).toEqual(['newBest1', 'newBest2', 'newBest3']);
    for (const url of Object.values(clips)) {
      const data = Buffer.from(url.split(',')[1]!, 'base64');
      expect(url.startsWith('data:audio/mpeg;base64,')).toBe(true);
      expect(data.length).toBeGreaterThan(15000);
      expect(data.subarray(0, 3).toString()).toBe('ID3');
    }
  }
});

test('every record extension qualifies, ties and below-record rounds do not', () => {
  const game = new WallTonesSequence();
  game.startNewRun();
  const round = () => {
    const previous = game.bestStreak;
    for (let n = game.sequence.length; n > 0; n--) game.onCorrectInput();
    return game.streak > previous;
  };
  expect(round()).toBe(true);
  expect(round()).toBe(true);
  expect(round()).toBe(true);
  game.onWrongInput();
  expect(round()).toBe(false);
  expect(round()).toBe(false);
  expect(round()).toBe(false);
  expect(round()).toBe(true);
});

test('first-run record announcements are3,6,9 then11 onward, later runs every record', () => {
  expect(Array.from({length:12}, (_, i) => i+1).filter(n => shouldAnnounceRecord(n,n-1,true))).toEqual([3,6,9,11,12]);
  expect(shouldAnnounceRecord(4,3,false)).toBe(true);
  expect(shouldAnnounceRecord(4,4,false)).toBe(false);
});

test('MR head-locked subtitles asset, registration, scenes, and tick are wired (backlog 21)', () => {
  const caption = readFileSync(new URL('../../public/ui/wall-tones-head-caption.uikitml', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../../src/assets.ts', import.meta.url), 'utf8');
  const mainScene = readFileSync(new URL('../../public/scenes/main.iwsdk.scene.json', import.meta.url), 'utf8');
  const arScene = readFileSync(new URL('../../public/scenes/wall-tones-ar.iwsdk.scene.json', import.meta.url), 'utf8');
  const system = readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts', import.meta.url), 'utf8');
  expect(caption).toContain('id="wall-tones-head-caption-text"');
  expect(assets).toContain("'wall-tones-head-caption'");
  expect(mainScene).toContain('"id": "wall-tones-head-caption"');
  expect(arScene).toContain('"id": "wall-tones-head-caption"');
  expect(system).toContain('tickHeadCaption');
  expect(system).toContain('HEAD_CAPTION_DISTANCE_M');
  // Regression guard for the empty-element compile trap: uikitml only
  // compiles a Text child for an element that starts with text, and
  // setProperties({ text }) silently no-ops without one. Both the
  // head-locked caption and the legacy panel fallback must stay seeded.
  expect(caption).toMatch(/id="wall-tones-head-caption-text"[^>]*>\.\.\./);
  const placeholder = readFileSync(new URL('../../public/ui/wall-tones-placeholder.uikitml', import.meta.url), 'utf8');
  expect(placeholder).toMatch(/id="wall-tones-spoken-caption"[^>]*>\.\.\./);
});

test('settings menu markup carries the build version line wired in app-mode', () => {
  const menu = readFileSync(new URL('../../public/ui/main-menu.uikitml', import.meta.url), 'utf8');
  const appMode = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  const buildInfo = readFileSync(new URL('../../src/build-info.ts', import.meta.url), 'utf8');
  expect(menu).toContain('id="settings-version"');
  expect(appMode).toContain('settings-version');
  expect(appMode).toContain('WALL_TONES_BUILD_LABEL');
  // Guarded so unit-style Node imports without Vite defines cannot crash.
  expect(buildInfo).toContain("typeof __WALL_TONES_VERSION__");
  expect(buildInfo).toContain("typeof __WALL_TONES_COMMIT__");
});

test('main menu carries the author credit line wired in app-mode', () => {
  const menu = readFileSync(new URL('../../public/ui/main-menu.uikitml', import.meta.url), 'utf8');
  const appMode = readFileSync(new URL('../../src/app-mode.ts', import.meta.url), 'utf8');
  expect(menu).toContain('id="main-menu-credit"');
  expect(menu).toContain('A game by Oded Sharon,  Corbomite Games.');
  // The credit hides while the Settings dialog is open and returns on Back.
  expect(appMode).toContain('main-menu-credit');
});

test('build identity is exposed and matches the shipped package version', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas', { timeout: 60_000 });
  const info = await page.evaluate(
    () =>
      (window as unknown as { __wallTonesBuildInfo?: { version: string; commit: string } })
        .__wallTonesBuildInfo,
  );
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  expect(info?.version).toBe(pkg.version);
  expect(info?.commit).toMatch(/^([0-9a-f]{7}|dev)$/);
});
