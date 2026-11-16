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
 let body=(await response.text()).replace('const system = this;', 'const system = this; window.__armbandHarness = {world:this.world,system:this};');
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
assert.ok(openState.panel[1]-openState.wrist[1]<0.32,'panel stays near palm (raised Nov 16 to clear the hand outline)');
assert.equal(await page.evaluate(()=>window.__armbandHarness.system.armband.squares.filter(s=>s.properties.peek().display!=='none').length),20);
console.log('SQUARES_20 OK');
assert.equal(await page.evaluate(()=>window.__armbandHarness.system.armbandBeam && window.__armbandHarness.system.armbandBeam.visible),true,'palm light beam visible over open palm');
console.log('BEAM OK');
// Nov 16 feedback: the panel must obscure the cone - the beam's tilted top
// disc stays fully on the palm side of the head-facing panel plane, and the
// beam draws before the panel so the panel composites over any overlap.
const occlusion=await page.evaluate(()=>{
 const s=window.__armbandHarness.system;const b=s.armbandBeam;
 const d=new b.position.constructor(0,1,0).applyQuaternion(b.quaternion);
 const top={x:b.position.x+d.x*b.scale.y/2,y:b.position.y+d.y*b.scale.y/2,z:b.position.z+d.z*b.scale.y/2};
 const p=s.armbandSmoothPos;const n=s.armbandPanelZ;
 return {penetration:(top.x-p.x)*n.x+(top.y-p.y)*n.y+(top.z-p.z)*n.z,renderOrder:b.renderOrder,housing:(()=>{const h=window.__armbandHarness.world.getSceneObject('wall-tones-armband-housing');return h?h.visible:'missing';})()};
});
console.log('BEAM_OCCLUSION',occlusion);
assert.ok(occlusion.penetration<-0.004,'beam top stays below the panel plane');
assert.equal(occlusion.renderOrder,-1,'panel composites over the beam');
assert.equal(occlusion.housing,false,'wrist cuff hidden in projector mode');
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
// Placement: panel floats higher above the palm and farther from the head.
const placement=await page.evaluate(()=>{
 const s=window.__armbandHarness.system;
 const panel=s.armbandSmoothPos;
 const palmMid=s.armbandGlow.position; // beam base = mid palm
 const head=new panel.constructor(); s.player.head.getWorldPosition(head);
 const h=(p)=>Math.hypot(p.x-head.x,p.z-head.z);
 return {rise:panel.y-palmMid.y,awayGain:h(panel)-h(palmMid),awayApplied:s.armbandLastAwayOffset.length()};
});
console.log('PLACEMENT',placement);
assert.ok(placement.rise>0.12,'panel floats higher above the palm');
// Nov 16 hardware feedback, three fixes:
// (a) the projector roots at the palm's surface center, not the wrist joint;
const originCheck=await page.evaluate(()=>{
 const s=window.__armbandHarness.system;
 const o=s.armbandLastPose.origin;const b=s.armbandGlow.position;
 // Real wrist BONE (nearest 'wrist' bone to the origin), not the cuff anchor.
 const V=s.armbandBeamBase.constructor;let wrist=null;
 window.__armbandHarness.world.scene.traverse(n=>{if(n.isBone&&n.name==='wrist'){const p=new V();n.getWorldPosition(p);const d=Math.hypot(p.x-b.x,p.y-b.y,p.z-b.z);if(!wrist||d<wrist.d)wrist={d};}});
 // Geometric cone apex (local narrow end, transform incl. scale) vs glow orb.
 const apex=new V(0,-0.5,0);s.armbandBeam.localToWorld(apex);
 return {mismatch:Math.hypot(o.x-b.x,o.y-b.y,o.z-b.z),wristDist:wrist?wrist.d:-1,
  apexToGlow:Math.hypot(apex.x-b.x,apex.y-b.y,apex.z-b.z)};
});
console.log('ORIGIN',originCheck);
assert.ok(originCheck.mismatch<0.005,'beam/glow root tracks the palm-origin pose');
assert.ok(originCheck.wristDist>0.015,'projector root is clear of the wrist joint bone');
// The cone apex is embedded 8mm behind the orb center; anything past the orb
// radius (~13mm with pulse) means the beam root visibly floats off the orb.
assert.ok(originCheck.apexToGlow<0.013,'beam cone apex sits inside the glow orb');
// (b) the glow is a fresnel-shaded orb, not a flat additive disc;
const glowMat=await page.evaluate(()=>{const m=window.__armbandHarness.system.armbandGlow.material;return {shader:m.isShaderMaterial===true,fresnel:(m.fragmentShader||'').includes('facing')};});
assert.ok(glowMat.shader&&glowMat.fresnel,'glow uses the fresnel shader');
// (c) the panel renders in front of everything (pads glows use renderOrder 12).
const layering=await page.evaluate(()=>{
 const o=window.__armbandHarness.world.getSceneObject('wall-tones-armband');
 const out={minOrder:Infinity,badMats:0};
 o.traverse((n)=>{if(n.renderOrder<out.minOrder)out.minOrder=n.renderOrder;const ms=Array.isArray(n.material)?n.material:n.material?[n.material]:[];for(const m of ms){if(m.depthTest!==false||m.depthWrite!==false)out.badMats++;}});
 return out;
});
console.log('LAYERING',layering);
assert.ok(layering.minOrder>=20,'panel draws after the pad glows (renderOrder 12)');
assert.equal(layering.badMats,0,'panel materials ignore depth (render in front)');
assert.ok(Math.abs(placement.awayApplied-0.06)<0.01,'head-away offset applied in full');
assert.ok(placement.awayGain>0.015,'panel sits farther from the head than the palm');
// Jitter: physical tracking noise (~+-5 mm at ~8 Hz) must not shake the panel
// or flap the open gate. Return to the jitter base pose and settle first.
await page.evaluate(async()=>await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps:[{position:{x:-.12,y:1.32,z:-.42},anchor:'wrist',orientation:{fingers:'forward',palm:'up'},duration:.2}]}));
await page.waitForTimeout(1500);
await page.evaluate(()=>{
 window.__jitterSamples=[];
 const s=window.__armbandHarness.system;
 const rec=()=>{window.__jitterSamples.push([s.armbandSmoothPos.x,s.armbandSmoothPos.y,s.armbandSmoothPos.z,s.armbandPanelPos.x,s.armbandPanelPos.y,s.armbandPanelPos.z,s.armband.position.x,s.armband.position.y,s.armband.position.z]);if(!window.__jitterStop)requestAnimationFrame(rec);};
 requestAnimationFrame(rec);
});
await page.evaluate(async()=>{
 const base={x:-.12,y:1.32,z:-.42};const steps=[];
 for(let i=0;i<10;i++){const s=i%2?0.005:-0.005;steps.push({position:{x:base.x+s,y:base.y+(i%4<2?s:-s),z:base.z},anchor:'wrist',orientation:{fingers:'forward',palm:'up'},duration:.15});}
 await window.IWER_DEVICE.remote.runSequence({device:'hand-left',idleHand:'keep',body:'fixed',gaze:'fixed',steps});
});
const jitter=await page.evaluate(()=>{
 window.__jitterStop=true;
 const a=window.__jitterSamples.slice(3);
 const rng=(k)=>Math.max(...a.map(p=>p[k]))-Math.min(...a.map(p=>p[k]));
 return {range:Math.max(rng(0),rng(1),rng(2)),targetRange:Math.max(rng(3),rng(4),rng(5)),wristRange:Math.max(rng(6),rng(7),rng(8)),samples:a.length,
   open:window.__armbandHarness.system.armbandProjectorOpen,
   visible:window.__armbandHarness.world.getSceneObject('wall-tones-armband').visible};
});
console.log('JITTER',jitter);
assert.ok(jitter.samples>10,'jitter sampler captured frames');
// NOTE: the headless emulator ticks at only ~5-20 fps, so the per-frame
// alternation lands near its Nyquist limit and the filter can only damp, not
// eliminate, it; the quantitative jitter-kill proof at real 90 fps rates is in
// tests/unit/palm-projector.test.mjs (OneEuro suite: 11 Hz +-3 mm -> <1 mm).
assert.ok(jitter.range<jitter.wristRange*0.65,'panel motion clearly damped versus raw hand jitter');
assert.ok(jitter.range<0.008,'panel jitter bounded in absolute terms');
assert.ok(jitter.open>0.95,'open gate does not flap under jitter');
assert.equal(jitter.visible,true,'panel stays visible under jitter');
await page.screenshot({path:join(evidenceDir,'armband-projector-jitter.png')});
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
// Nov 16 feedback: the wristband is hidden for now, so the settings row no
// longer offers the band/projector toggle; the projector is the only display.
console.log('TOGGLE',await page.evaluate(()=>{
 const menu=window.__armbandHarness.world.getSceneObject('main-menu-panel');
 return {rowDisplay:menu.getElementById('armband-mode-button')?.properties.peek().display};
}));
assert.equal(await page.evaluate(()=>window.__armbandHarness.world.getSceneObject('main-menu-panel').getElementById('armband-mode-button')?.properties.peek().display),'none','wristband mode row hidden while the wristband is disabled');
await page.screenshot({path:join(evidenceDir,'armband-projector-toggle.png')});
console.log('PASS: projector float over open palm, 20 real cues, fist fold, tilt fold, reopen, beam occlusion, hidden wristband toggle.');
} finally { await browser.close(); }
