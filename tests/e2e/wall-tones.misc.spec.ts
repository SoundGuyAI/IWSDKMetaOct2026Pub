import { RETURN_DIALOGUE } from '../../src/wall-tones/return-dialogue.js';
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

async function scoringSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const d = (window as any).__wallTonesDebug;
    return { flow: d.flowPhase, phase: d.phase, visible: d.scoreInfoVisible, displays: d.scoringUiDisplays, explanation: d.gameExplanationDisplay };
  });
}

async function bootScoringCheck(page: import('@playwright/test').Page) {
  await page.addInitScript(() => sessionStorage.setItem('iwsdk-experience-mode', 'walltones'));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__wallTonesDebug?.flatAwaitingStart);
}

test('flat scoring, Store and Achievements stay visible before the first pad press (backlog 23)', async ({ page }) => {
  await bootScoringCheck(page);
  await expect.poll(async () => (await scoringSnapshot(page)).visible).toBe(true);
  const snap = await scoringSnapshot(page);
  expect(snap.phase).toBe('idle');
  expect(snap.explanation).toBe('flex');
  expect(Object.values(snap.displays)).toEqual(['flex', 'flex', 'flex', 'flex', 'flex']);
});

test('MR placement path hides scoring, Store and Achievements, then shows them during intro (backlog 23)', async ({ page }) => {
  await bootScoringCheck(page);
  // Synthetic slots exercise the production picking/finish path, not real XR planes.
  await page.evaluate(() => (window as any).__wallTonesDebug.startFakeWallPick());
  for (let i = 0; i < 4; i++) {
    await expect.poll(async () => (await scoringSnapshot(page)).visible).toBe(false);
    const snap = await scoringSnapshot(page);
    expect(snap.flow).toBe('wall-picking');
    expect(snap.explanation).toBe('none');
    expect(Object.values(snap.displays)).toEqual(['none', 'none', 'none', 'none', 'none']);
    await page.evaluate(i => (window as any).__wallTonesDebug.selectSlot(i), i);
  }
  await expect.poll(async () => (await scoringSnapshot(page)).visible).toBe(true);
  const intro = await scoringSnapshot(page);
  expect(intro.flow).toBe('playing');
  expect(intro.explanation).toBe('flex');
  expect(intro.phase).toBe('idle'); // Intro is before startNewRun/playback.
  expect(Object.values(intro.displays)).toEqual(['flex', 'flex', 'flex', 'flex', 'flex']);
});

test('background review proposal: afterAct1, every second completed pattern, captured cast and saved completion', async ({page}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    sessionStorage.setItem('iwsdk-experience-mode','walltones');
    localStorage.setItem('wall-tones-cypher-act1-progress-v1', JSON.stringify({version:1,next:14}));
    localStorage.removeItem('wall-tones-cypher-background-progress-v1');
    localStorage.setItem('wall-tones-voice-gender','male');
    localStorage.setItem('wall-tones-hearing-subtitles','true');
    localStorage.setItem('wall-tones-best-streak','1000');
  });
  const requests:string[]=[];
  page.on('request',r=>{ if(r.url().includes('/audio/story/background/'))requests.push(r.url()); });
  await page.goto('/');
  await page.waitForFunction(()=> (window as any).__wallTonesDebug?.flatAwaitingStart);
  await page.evaluate(()=> (window as any).__wallTonesDebug.skipSpeech());
  await page.evaluate(()=> (window as any).__wallTonesDebug.submitPad(0));
  for(let round=0;round<2;round++) {
    await page.waitForFunction(()=> (window as any).__wallTonesDebug?.phase==='input');
    const sequence=await page.evaluate(()=> [...(window as any).__wallTonesDebug.sequence]);
    for(const index of sequence) {
      await page.waitForFunction(()=> (window as any).__wallTonesDebug?.phase==='input');
      await page.evaluate(index=>(window as any).__wallTonesDebug.submitPad(index),index);
    }
    if(round===0) {
      await page.waitForFunction(()=> (window as any).__wallTonesDebug?.phase==='input');
      expect(requests).toHaveLength(0);
    }
  }
  await expect.poll(()=>requests.some(url=>url.endsWith('/female/r01.mp3'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=> (window as any).__wallTonesDebug.backgroundLinesCompleted)).toBe(1);
  expect(requests.some(url=>url.endsWith('/effects/close.mp3'))).toBe(true);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('wall-tones-cypher-background-progress-v1')!).next)).toBe(1);
  await page.screenshot({path:test.info().outputPath('background-female-gameplay.png')});
});


test('returning store reminder uses binary answer once after reopening and retains heard data', async ({page}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('iwsdk-experience-mode','walltones');
    if (!localStorage.getItem('reminder-test-seeded')) {
      localStorage.setItem('wall-tones-return-visit-v1','1');
      localStorage.setItem('wall-tones-instructions-v1',JSON.stringify({version:1,heard:['storeIntro']}));
      localStorage.setItem('reminder-test-seeded','1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
  await page.waitForTimeout(1500);
  // Skip only pre-existing entry speech, never the reminder under test.
  await page.evaluate(()=>window.__wallTonesDebug!.skipSpeech());
  await page.evaluate(()=>window.__wallTonesDebug!.toggleStore());
  await page.waitForFunction(()=>window.__wallTonesDebug!.reminderListening);
  expect(await page.evaluate(()=>window.__wallTonesDebug!.reminderQuestion)).toBe('Would you like a reminder of how the store works?');
  const heard=await page.evaluate(()=>localStorage.getItem('wall-tones-instructions-v1'));
  await page.screenshot({path:'test-results/return-store-reminder-desktop.png'});
  // Pixel-inspected rendered Yes button, actual pointer route rather than debug answer.
  await page.mouse.click(811,437);
  await expect.poll(()=>page.evaluate(()=>window.__wallTonesDebug!.reminderListening),{timeout:1000}).toBe(false);
  expect(await page.evaluate(()=>window.__wallTonesDebug!.reminderBusy)).toBe(true);
  await page.waitForFunction(()=>!window.__wallTonesDebug!.reminderBusy);
  expect(await page.evaluate(()=>localStorage.getItem('wall-tones-instructions-v1'))).toBe(heard);
  await page.evaluate(()=>{window.__wallTonesDebug!.toggleStore();window.__wallTonesDebug!.toggleStore();});
  expect(await page.evaluate(()=>window.__wallTonesDebug!.reminderBusy)).toBe(false);
  await page.reload();await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
  await page.waitForTimeout(1500);await page.evaluate(()=>{window.__wallTonesDebug!.skipSpeech();window.__wallTonesDebug!.toggleStore();});
  await page.waitForFunction(()=>window.__wallTonesDebug!.reminderListening);
  await page.keyboard.press('n');await page.waitForFunction(()=>!window.__wallTonesDebug!.reminderBusy);
  expect(await page.evaluate(()=>localStorage.getItem('wall-tones-instructions-v1'))).toBe(heard);
});


test('phone returning reminder is visible, times out safely, and cannot reset progress', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    sessionStorage.setItem('iwsdk-experience-mode','walltones');
    localStorage.setItem('wall-tones-return-visit-v1','1');
    localStorage.setItem('wall-tones-instructions-v1',JSON.stringify({version:1,heard:['storeIntro']}));
    localStorage.setItem('wall-tones-bars','75');
  });
  await page.goto('/');await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
  await page.waitForTimeout(1500);await page.evaluate(()=>{window.__wallTonesDebug!.skipSpeech();window.__wallTonesDebug!.toggleStore();});
  await page.waitForFunction(()=>window.__wallTonesDebug!.reminderListening);
  const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await page.screenshot({path:'test-results/return-store-reminder-phone.png'});
  await page.waitForFunction(()=>!window.__wallTonesDebug!.reminderBusy);
  expect(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))))).toBe(before);
});


test('all reviewed return clips and opening transitions in both casts load and decode as real audio',async({page})=>{
 await page.goto('/');
 const paths=[...Object.entries(RETURN_DIALOGUE).flatMap(([id,line])=>['male','female'].map(g=>`audio/return-reminders/${line.speaker}/${g}/${id.toLowerCase()}.mp3`)),...['male','female'].map(g=>`audio/speech/${g}/opening-pattern.mp3`)];
 const decoded=await page.evaluate(async paths=>{
  const context=new AudioContext();
  try { return await Promise.all(paths.map(async path=>{
   const response=await fetch(path);if(!response.ok)throw Error(path+': '+response.status);
   const buffer=await context.decodeAudioData(await response.arrayBuffer());return {path,duration:buffer.duration,channels:buffer.numberOfChannels};
  })); }finally{await context.close();}
 },paths);
 expect(decoded).toHaveLength(24);for(const clip of decoded){expect(clip.duration).toBeGreaterThan(1);expect(clip.channels).toBe(1);}
});


test('returning round reminder can be skipped without blocking play',async({page})=>{
 await page.addInitScript(()=>{sessionStorage.setItem('iwsdk-experience-mode','walltones');localStorage.setItem('wall-tones-return-visit-v1','1');localStorage.setItem('wall-tones-instructions-v1',JSON.stringify({version:1,heard:['howToPlay','pointAndPress','howToPlayRest']}));});
 await page.goto('/');await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
 await page.evaluate(()=>window.__wallTonesDebug!.submitPad(0));
 await page.waitForFunction(()=>window.__wallTonesDebug!.reminderListening);
 expect(await page.evaluate(()=>window.__wallTonesDebug!.reminderQuestion)).toBe('Would you like a reminder of how to play?');
 await page.evaluate(()=>window.__wallTonesDebug!.skipSpeech());
 await page.waitForFunction(()=>window.__wallTonesDebug!.phase==='input');
 expect(await page.evaluate(()=>window.__wallTonesDebug!.reminderListening)).toBe(false);
});

for (const gender of ['male','female'] as const) {
 test(`opening pattern transition completes before existing tutorial, persists on reload (${gender})`,async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  const requested:string[]=[];page.on('request',r=>{if(r.url().includes('/audio/speech/'))requested.push(r.url());});
  await page.addInitScript(gender=>{sessionStorage.setItem('iwsdk-experience-mode','walltones');localStorage.setItem('wall-tones-voice-gender',gender);},gender);
  await page.goto('/');await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
  // Normal pointer start on a visible pad. Debug is only a read-only phase observer.
  await page.waitForFunction(()=>!window.__wallTonesDebug!.speechBusy);
  await page.mouse.move(315,245,{steps:4});await page.mouse.move(335,251,{steps:4});await page.waitForTimeout(400);
  await page.mouse.down();await page.mouse.move(338,253,{steps:3});await page.waitForTimeout(150);await page.mouse.up();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wall-tones-instructions-v1')??'{}').heard?.includes('howToPlayRest'));
  const opening=requested.findIndex(x=>x.endsWith(`/${gender}/opening-pattern.mp3`));
  const rest=requested.findIndex(x=>x.endsWith(`/${gender}/how-to-play-rest.mp3`));
  expect(opening).toBeGreaterThanOrEqual(0);expect(rest).toBeGreaterThan(opening);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('wall-tones-instructions-v1')!).heard)).toContain('openingPattern');
  await page.waitForFunction(()=>window.__wallTonesDebug!.phase==='input');
  await page.screenshot({path:`test-results/opening-pattern-${gender}.png`});
  requested.length=0;await page.reload();await page.waitForFunction(()=>Boolean(window.__wallTonesDebug?.flatAwaitingStart));
  await page.waitForFunction(()=>!window.__wallTonesDebug!.speechBusy);
  await page.mouse.move(315,245,{steps:4});await page.mouse.move(335,251,{steps:4});await page.waitForTimeout(400);await page.mouse.down();await page.mouse.move(338,253,{steps:3});await page.waitForTimeout(150);await page.mouse.up();
  // Returning offer is dismissed with the real keyboard, not a debug answer.
  await page.waitForFunction(()=>window.__wallTonesDebug!.reminderListening,{},{timeout:30000});await page.keyboard.press('n');
  await page.waitForFunction(()=>window.__wallTonesDebug!.phase==='input');
  expect(requested.some(x=>x.endsWith('/opening-pattern.mp3'))).toBe(false);
  expect(requested.some(x=>x.endsWith('/how-to-play-rest.mp3'))).toBe(false);
 });
}
