import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
// Run against an app-only IWSDK dev server, not the production preview.
const evidenceDir=process.env.XR_EVIDENCE_DIR || 'test-results/armband-xr';
await mkdir(evidenceDir,{recursive:true});
import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try {
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:600,height:600}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));

await page.addInitScript(()=>{sessionStorage.setItem('iwsdk-experience-mode','walltones');localStorage.setItem('wall-tones-voices-off','true');});
await page.route(/\/src\/wall-tones\/wall-tones-system\.ts(?:\?.*)?$/, async route => {
 const response=await route.fetch();
 const body=(await response.text()).replace('const system = this;', 'const system = this; window.__armbandHarness = {world:this.world,system:this};');
 await route.fulfill({response,body});
});
await page.goto(process.env.XR_URL || 'https://localhost:8081');
await page.waitForFunction(()=>window.__wallTonesDebug);
await page.waitForFunction(()=>window.__armbandHarness);
console.log('READY',await page.evaluate(()=>({phase:window.__wallTonesDebug.phase,flow:window.__wallTonesDebug.flowPhase})));
console.log('DEV',await page.evaluate(()=>({hands:Object.keys(window.IWER_DEVICE.hands),mode:window.IWER_DEVICE.primaryInputMode})));
await page.evaluate(async()=>{
 const {getActiveWorld}=await import('/src/wall-tones/world-host.ts'); window.__testWorld=window.__armbandHarness.world;
 window.IWER_DEVICE.primaryInputMode='hand';
 await window.__testWorld.launchXR();
});

await page.waitForFunction(()=>window.IWER_DEVICE.activeSession && window.__wallTonesDebug.flowPhase==='choose-mode');
console.log('PREP',await page.evaluate(async()=>{
 const {system,world}=window.__armbandHarness;
 system.flowPhase='playing';system.experienceActive=true;system.game.phase='input';system.lastInputAt=performance.now()/1000;system.idleReplayQueued=false;
 system.game.sequence=[0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3];system.game.inputStep=0;
 const d=window.IWER_DEVICE;d.stereoEnabled=false;world.renderer.setPixelRatio(.5);
 d.hands.left.position.set(-.15,1.3,-.4);d.hands.left.quaternion.set(.70710678,0,0,.70710678);
 d.hands.right.position.set(.4,1.5,-.3);
 return {session:true};
}));
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.15,y:1.3,z:-.4},anchor:'wrist',orientation:{fingers:'right',palm:'down'},duration:.1}]}));
await page.waitForFunction(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband')?.visible);
await page.evaluate(async()=>await window.IWER_DEVICE.remote.dispatch('set_connected',{device:'gaze',connected:false}).catch(()=>{}));

console.log('POSE',await page.evaluate(()=>{
 const {world}=window.__armbandHarness;const o=world.getSceneObject('wall-tones-armband');
 return {position:o.position.toArray(),rotation:o.quaternion.toArray(),visible:o.visible};
}));
await page.evaluate(()=>{ const p=window.__armbandHarness.world.getSceneObject('wall-tones-armband');window.__clickLog=[];for(const name of ['armband-modifiers','armband-repeat']) for(const type of ['click','pointerdown','pointerup'])p.getElementById(name).addEventListener(type,e=>window.__clickLog.push({name,type,pointer:e.pointerType,at:performance.now(),store:window.__wallTonesDebug.storeOpen})); });
assert.deepEqual(await page.evaluate(async()=>{
 const r=window.IWER_DEVICE.remote;
 const target=r.executeListTargets({}).targets.find(t=>t.name==='armband-modifiers').position;
 await r.dispatch('set_connected',{device:'gaze',connected:false}).catch(()=>{});
 await r.dispatch('look_at',{device:'hand-right',target});
 await new Promise(resolve=>setTimeout(resolve,300));
 await r.dispatch('select',{device:'hand-right',duration:.12});
 await new Promise(resolve=>setTimeout(resolve,200));
 return {store:window.__wallTonesDebug.storeOpen};
}), {store:true});
console.log('EVENTS',await page.evaluate(()=>window.__clickLog));
async function ray(name) {
 return page.evaluate(async name=>{
 const r=window.IWER_DEVICE.remote;const target=r.executeListTargets({}).targets.find(t=>t.name===name).position;
 await r.dispatch('look_at',{device:'hand-right',target});await new Promise(resolve=>setTimeout(resolve,300));
 await r.dispatch('select',{device:'hand-right',duration:.2});await new Promise(resolve=>setTimeout(resolve,250));
 return {store:window.__wallTonesDebug.storeOpen};
 },name);
}
assert.deepEqual(await ray('armband-modifiers'),{store:false});
await page.evaluate(()=>{const d=window.__wallTonesDebug;d.grantBars(200);d.buyReplay();const s=window.__armbandHarness.system;s.game.sequence=[0];s.game.phase='input';s.game.inputStep=0;s.lastInputAt=performance.now()/1000;s.idleReplayQueued=false;});
await page.waitForTimeout(300);
assert.equal(await page.evaluate(()=>window.__wallTonesDebug.replaysTotal),1);
await ray('armband-repeat');
assert.equal(await page.evaluate(()=>window.__wallTonesDebug.replaysTotal),0);
assert.deepEqual(await ray('armband-hint-button'),{store:true});
assert.equal(await page.evaluate(()=>window.__wallTonesDebug.storeSelected),'hint');
assert.deepEqual(await ray('armband-autoplay'),{store:true});
assert.equal(await page.evaluate(()=>window.__wallTonesDebug.storeSelected),'autoplay');
await page.waitForFunction(()=>window.__wallTonesDebug.phase==='input');
await page.evaluate(async()=>{
 const d=window.__wallTonesDebug;d.grantBars(100000);d.buyListen();for(let i=0;i<5;i++)d.buyHint();
 const s=window.__armbandHarness.system;s.game.sequence=Array.from({length:35},(_,i)=>i%4);s.game.inputStep=12;s.game.phase='input';s.game.streak=24;s.game.bestStreak=38;
 const world=window.__armbandHarness.world;world.getSceneObject('wall-tones-panel').visible=false;
 const r=window.IWER_DEVICE.remote;
 await r.dispatch('look_at',{device:'headset',target:world.getSceneObject('wall-tones-armband').position});
});
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.1,y:1.45,z:-.38},anchor:'wrist',orientation:{fingers:'right',palm:'forward'},duration:.3}]}));
await page.waitForTimeout(1000);
assert.equal(await page.evaluate(()=>window.__armbandHarness.system.armband.squares.filter(s=>s.properties.peek().display!=='none').length),20);
await page.screenshot({path:join(evidenceDir,'armband-xr-20-notes.png')});
console.log('TRACKING_LOST',await page.evaluate(async()=>{
 await window.IWER_DEVICE.remote.dispatch('set_connected',{device:'hand-left',connected:false});
 return {connected:window.IWER_DEVICE.hands.left.connected};
}));
await page.waitForFunction(()=>!window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible);
console.log('HIDDEN',true);
await page.evaluate(async()=>{
 await window.IWER_DEVICE.remote.dispatch('set_connected',{device:'hand-left',connected:true});
 const {setArmbandHand}=await import('/src/wall-tones/armband.ts');setArmbandHand('right');
});
await page.waitForFunction(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible);
console.log('RIGHT_HAND',await page.evaluate(()=>({label:window.__armbandHarness.world.getSceneObject('wall-tones-armband').getElementById('armband-hand-label').properties.peek().text,preference:localStorage.getItem('wall-tones-armband-hand')})));
await page.screenshot({path:join(evidenceDir,'armband-xr-right.png')});
assert.equal(await page.evaluate(()=>localStorage.getItem('wall-tones-armband-hand')),'right');
// Game Over: the band must stay on the wrist with inert controls (user feedback Nov 14).
await page.evaluate(async()=>{
 const {setArmbandHand}=await import('/src/wall-tones/armband.ts');setArmbandHand('left');
 // Mirror the real wrong-press handler: game over closes other popups.
 const s=window.__armbandHarness.system;s.flowPhase='playing';s.experienceActive=true;s.storeOpen=false;s.achievementsOpen=false;s.gameOverOpen=true;s.game.phase='resetting';
});
await page.waitForTimeout(400);
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible),true,'band stays visible on game over');
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband-housing')?.visible ?? true),true,'housing stays visible on game over');
console.log('GAME_OVER',await page.evaluate(()=>{
 const p=window.__armbandHarness.world.getSceneObject('wall-tones-armband');
 return {phase:p.getElementById('armband-phase').properties.peek().text,
  modifiersDisabled:p.getElementById('armband-modifiers').properties.peek().disabled,
  repeatDisabled:p.getElementById('armband-repeat').properties.peek().disabled};
}));
const gameOverPress=await page.evaluate(async()=>{
 const r=window.IWER_DEVICE.remote;
 const t=r.executeListTargets({}).targets.find(t=>t.name==='armband-modifiers');
 if(t){ await r.dispatch('look_at',{device:'hand-right',target:t.position}); await new Promise(res=>setTimeout(res,300)); await r.dispatch('select',{device:'hand-right',duration:.12}); await new Promise(res=>setTimeout(res,200)); }
 return {targetListed:!!t, store:window.__wallTonesDebug.storeOpen};
});
console.log('GAME_OVER_PRESS',gameOverPress);
assert.equal(gameOverPress.store,false,'store stays closed on game over');
await page.screenshot({path:join(evidenceDir,'armband-xr-game-over.png')});
await page.evaluate(()=>{window.__armbandHarness.system.gameOverOpen=false;});
await page.waitForTimeout(400);
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband').getElementById('armband-modifiers').properties.peek().disabled),false,'controls restore after game over');
await page.evaluate(()=>{window.__armbandHarness.system.flowPhase='choose-mode';});
await page.waitForFunction(()=>!window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible);
console.log('PASS: hand rays, Replay cost, upgrade destinations, 20 owned cues, tracking-loss hide, arm preference, game-over visible/inert/restore, setup hide. Poke and physical headset are not verified.');
} finally { await browser.close(); }
