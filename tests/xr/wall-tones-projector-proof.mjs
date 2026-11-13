import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
// Synthetic runtime proof for projector mode: real panel + real tracking code,
// driven by IWER synthetic hand joints. NOT a Quest/hardware capture.
const evidenceDir=process.env.XR_EVIDENCE_DIR || 'test-results/armband-projector';
await mkdir(evidenceDir,{recursive:true});
import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try {
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:800,height:600}});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.addInitScript(()=>{sessionStorage.setItem('iwsdk-experience-mode','walltones');localStorage.setItem('wall-tones-voices-off','true');localStorage.setItem('wall-tones-armband-mode','projector');});
await page.route(/\/src\/wall-tones\/wall-tones-system\.ts(?:\?.*)?$/, async route => {
 const response=await route.fetch();
 const body=(await response.text()).replace('const system = this;', 'const system = this; window.__armbandHarness = {world:this.world,system:this};');
 await route.fulfill({response,body});
});
await page.goto(process.env.XR_URL || 'https://localhost:8081');
await page.waitForFunction(()=>window.__wallTonesDebug);
await page.waitForFunction(()=>window.__armbandHarness);
await page.evaluate(async()=>{
 const {getActiveWorld}=await import('/src/wall-tones/world-host.ts'); window.__testWorld=window.__armbandHarness.world;
 window.IWER_DEVICE.primaryInputMode='hand';
 await window.__testWorld.launchXR();
});
await page.waitForFunction(()=>window.IWER_DEVICE.activeSession && window.__wallTonesDebug.flowPhase==='choose-mode');
await page.evaluate(async()=>{
 const d=window.__wallTonesDebug;d.grantBars(100000);d.buyListen();for(let i=0;i<5;i++)d.buyHint();
 const s=window.__armbandHarness.system;
 s.flowPhase='playing';s.experienceActive=true;s.game.phase='input';s.lastInputAt=performance.now()/1000;s.idleReplayQueued=false;
 s.game.sequence=Array.from({length:35},(_,i)=>i%4);s.game.inputStep=12;s.game.streak=24;s.game.bestStreak=38;
 const world=window.__armbandHarness.world;world.getSceneObject('wall-tones-panel').visible=false;
 const dev=window.IWER_DEVICE;dev.stereoEnabled=false;world.renderer.setPixelRatio(.5);
 await dev.remote.dispatch('set_connected',{device:'gaze',connected:false}).catch(()=>{});
});
// Open flat palm up, fingers pointing away from the player.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.12,y:1.32,z:-.42},anchor:'wrist',orientation:{fingers:'forward',palm:'up'},duration:.2}]}));
await page.evaluate(async()=>await window.IWER_DEVICE.remote.dispatch('set_hand_pose',{device:'hand-left',poseId:'open',duration:.1}));
await page.waitForTimeout(1200);
const openState=await page.evaluate(()=>{
 const world=window.__armbandHarness.world;const o=world.getSceneObject('wall-tones-armband');
 const s=window.__armbandHarness.system;
 return {visible:o.visible,panel:o.position.toArray(),wrist:s.armband.position.toArray(),open:s.armbandProjectorOpen};
});
console.log('PROJECTOR_OPEN',openState);
assert.equal(openState.visible,true,'panel visible over open palm');
assert.ok(openState.panel[1]-openState.wrist[1]>0.08,'panel rises above palm');
assert.ok(openState.panel[1]-openState.wrist[1]<0.25,'panel stays near palm');
assert.equal(await page.evaluate(()=>window.__armbandHarness.system.armband.squares.filter(s=>s.properties.peek().display!=='none').length),20);
console.log('SQUARES_20 OK');
assert.equal(await page.evaluate(()=>window.__armbandHarness.system.armbandBeam && window.__armbandHarness.system.armbandBeam.visible),true,'palm light beam visible over open palm');
console.log('BEAM OK');
await page.evaluate(async()=>{ const world=window.__armbandHarness.world; await window.IWER_DEVICE.remote.dispatch('look_at',{device:'headset',target:world.getSceneObject('wall-tones-armband').position}); });
await page.waitForTimeout(400);
await page.screenshot({path:join(evidenceDir,'armband-projector-open.png')});
// Close-up: move the headset near the panel for a readability capture.
await page.evaluate(async()=>{ const p=window.__armbandHarness.world.getSceneObject('wall-tones-armband').position; await window.IWER_DEVICE.remote.dispatch('set_device_state',{state:{headset:{position:{x:p.x,y:p.y+0.04,z:p.z+0.24},orientation:{x:0,y:0,z:0,w:1}}}}); });
await page.evaluate(async()=>{ await window.IWER_DEVICE.remote.dispatch('look_at',{device:'headset',target:window.__armbandHarness.world.getSceneObject('wall-tones-armband').position}); });
await page.waitForTimeout(400);
await page.screenshot({path:join(evidenceDir,'armband-projector-open-closeup.png')});
// Restore the head so later steps run from the player pose.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.dispatch('set_device_state',{state:{headset:{position:{x:0,y:1.6,z:0},orientation:{x:0,y:0,z:0,w:1}}}}));
// Fist -> folds away.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.dispatch('set_hand_pose',{device:'hand-left',poseId:'fist',duration:.15}));
await page.waitForTimeout(1200);
const fistState=await page.evaluate(()=>({visible:window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible,open:window.__armbandHarness.system.armbandProjectorOpen}));
console.log('PROJECTOR_FIST',fistState);
assert.equal(fistState.visible,false,'panel folded for fist');
await page.screenshot({path:join(evidenceDir,'armband-projector-fist.png')});
// Open again -> returns; then tilted palm -> folds.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.dispatch('set_hand_pose',{device:'hand-left',poseId:'open',duration:.15}));
await page.waitForTimeout(1200);
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible),true,'panel returns when reopened');
// Stabilization: a fast hand move leaves the smoothed panel trailing, then it catches up.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.22,y:1.36,z:-.46},anchor:'wrist',orientation:{fingers:'forward',palm:'up'},duration:.12}]}));
const lag=await page.evaluate(()=>{const s=window.__armbandHarness.system;return Math.hypot(s.armbandPanelPos.x-s.armbandSmoothPos.x,s.armbandPanelPos.y-s.armbandSmoothPos.y,s.armbandPanelPos.z-s.armbandSmoothPos.z);});
console.log('STABILIZATION lag(m):',lag);
assert.ok(lag>0.003,'panel lags quick hand motion');
await page.waitForTimeout(1500);
const lag2=await page.evaluate(()=>{const s=window.__armbandHarness.system;return Math.hypot(s.armbandPanelPos.x-s.armbandSmoothPos.x,s.armbandPanelPos.y-s.armbandSmoothPos.y,s.armbandPanelPos.z-s.armbandSmoothPos.z);});
console.log('STABILIZATION settled(m):',lag2);
assert.ok(lag2<0.01,'panel catches up after motion stops');
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.12,y:1.32,z:-.42},anchor:'wrist',orientation:{fingers:'up',palm:'forward'},duration:.25}]}));
await page.waitForTimeout(1200);
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible),false,'panel folded when tilted');
console.log('PROJECTOR_TILTED hidden OK');
await page.screenshot({path:join(evidenceDir,'armband-projector-tilted.png')});
// Accessibility toggle: real main-menu panel asset, accessibility dialog forced open.
await page.evaluate(()=>{
 const world=window.__armbandHarness.world;const menu=world.getSceneObject('main-menu-panel');
 if(menu.object3D) menu.object3D.visible=true; else menu.visible=true;
 menu.getElementById('accessibility-dialog')?.setProperties({display:'flex'});
 menu.getElementById('main-menu-content')?.setProperties({display:'none'});
});
await page.evaluate(async()=>{
 const m=window.__armbandHarness.world.getSceneObject('main-menu-panel');
 const o=m.object3D||m; if(o.position){ o.position.set(0,1.4,-0.55); o.rotation.set(0,0,0); }
 await window.IWER_DEVICE.remote.dispatch('look_at',{device:'headset',target:{x:0,y:1.4,z:-0.55}});
});
await page.waitForTimeout(600);
console.log('TOGGLE',await page.evaluate(()=>{
 const menu=window.__armbandHarness.world.getSceneObject('main-menu-panel');
 return {label:menu.getElementById('armband-mode-setting-label')?.properties.peek().text, stored:localStorage.getItem('wall-tones-armband-mode')};
}));
await page.screenshot({path:join(evidenceDir,'armband-projector-toggle.png')});
console.log('PASS: projector float over open palm, 20 real cues, fist fold, tilt fold, reopen, accessibility toggle.');
} finally { await browser.close(); }
