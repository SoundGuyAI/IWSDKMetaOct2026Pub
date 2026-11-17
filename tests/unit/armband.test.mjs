import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const windowSrc = readFileSync('src/wall-tones/hint-window.ts','utf8');
const windowJs = ts.transpileModule(windowSrc,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {hintWindowStart} = await import('data:text/javascript;base64,'+Buffer.from(windowJs).toString('base64'));
test('bounded hint window follows the relevant position and retains the final full 20',()=>{
 assert.equal(hintWindowStart(12,4),0);
 assert.equal(hintWindowStart(20,19),0);
 assert.equal(hintWindowStart(40,9),9);
 assert.equal(hintWindowStart(40,39),20);
 assert.equal(hintWindowStart(40,-1),0);
});
const source=readFileSync('src/wall-tones/armband.ts','utf8');
// Pure cue selection is isolated so no renderer or DOM is involved.
const pure=source.slice(source.indexOf('export function armbandCueIds'),source.indexOf('/** Shared by hand joints'));
const js=ts.transpileModule(pure,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {armbandCueIds}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sequence=Array.from({length:40},(_,i)=>i%4);
test('armband never reveals unowned input hints or unheard Listen notes',()=>{
 assert.deepEqual(armbandCueIds({sequence,phase:'input',hintCount:0}),[]);
 assert.equal(armbandCueIds({sequence,phase:'input',hintCount:5}).length,5);
 assert.deepEqual(armbandCueIds({sequence,phase:'playback',listen:false,playbackShown:30}),[]);
 assert.equal(armbandCueIds({sequence,phase:'playback',listen:true,playbackShown:7}).length,7);
 assert.deepEqual(armbandCueIds({sequence,phase:'idle',hintCount:20}),[]);
});
test('both scenes provide poke/ray wrist UI and a housing, default hand is left',()=>{
 for(const file of ['main','wall-tones-ar']){
  const nodes=JSON.parse(readFileSync(`public/scenes/${file}.iwsdk.scene.json`,'utf8')).nodes;
  const panel=nodes.find(n=>n.id==='wall-tones-armband');
  assert.ok(panel.components.RayInteractable);assert.ok(panel.components.PokeInteractable);
  assert.ok(nodes.find(n=>n.id==='wall-tones-armband-housing'));
 }
 assert.match(source,/getItem\(HAND_KEY\) === 'right' \? 'right' : 'left'/);
});

test('wristband hidden for now: projector is the forced display, cuff and settings row gated (Nov 16 feedback)',()=>{
 assert.match(source,/return sessionMode \?\? 'projector'/);
 const system=readFileSync('src/wall-tones/wall-tones-system.ts','utf8');
 assert.match(system,/housing\.object3D\.visible = tracked && armbandDisplayMode\(\) === 'band'/);
 assert.match(system,/armbandBeam\.renderOrder = -1/);
 const appMode=readFileSync('src/app-mode.ts','utf8');
 assert.match(appMode,/armband-mode-button'\)\?\.setProperties\(\{ display: 'none' \}/);
});
test('hand setting defaults left, persists right, and survives unavailable storage',async()=>{
 const preferenceSource=source.slice(source.indexOf('const HAND_KEY'),source.indexOf("import { Matrix4"));
 const preferenceJs=ts.transpileModule(preferenceSource,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 const values=new Map();let notifications=0;
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 globalThis.window={dispatchEvent:()=>{notifications++;}};
 try {
  const preferences=await import('data:text/javascript;base64,'+Buffer.from(preferenceJs).toString('base64'));
  assert.equal(preferences.armbandHand(),'left');
  preferences.setArmbandHand('right');
  assert.equal(values.get('wall-tones-armband-hand'),'right');
  assert.equal(preferences.armbandHand(),'right');
  globalThis.localStorage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  preferences.setArmbandHand('left');
  assert.equal(preferences.armbandHand(),'left');
  assert.equal(notifications,2);
 } finally {delete globalThis.localStorage;delete globalThis.window;}
});

test('Nov 16 panel revision: Play/New Run/Skip Voice replace Modifiers/Hint/Autoplay',()=>{
 const ui=readFileSync('public/ui/wall-tones-armband.uikitml','utf8');
 for(const gone of ['armband-modifiers','armband-hint-button','armband-autoplay']) assert.ok(!ui.includes(gone),gone+' removed from panel');
 for(const added of ['armband-play','armband-newrun','armband-skip-voice']) assert.ok(ui.includes(`id="${added}"`),added+' added to panel');
 // Reserved slots hold the row space while the context buttons are hidden.
 assert.match(ui,/\.slot \{ width: 155px; height: 56px; \}/);
 assert.match(ui,/id="armband-newrun"[^>]*style="display: none"/);
 assert.match(ui,/id="armband-skip-voice"[^>]*style="display: none"/);
 const system=readFileSync('src/wall-tones/wall-tones-system.ts','utf8');
 assert.match(system,/bind\('armband-play', \(\) => \{ if \(this\.armbandUsable\(\) && this\.economy\.getPlayLevel\(\) >= 1\) void this\.onPlayControl\(\); \}\)/);
 assert.match(system,/bind\('armband-newrun', \(\) => \{ if \(this\.armbandTrackable\(\) && this\.gameOverOpen\) this\.onGameOverNewRun\(\); \}\)/);
 assert.match(system,/bind\('armband-skip-voice', \(\) => \{ if \(this\.armbandTrackable\(\)\) this\.onSkipVoice\(\); \}\)/);
 for(const gone of ['armband-modifiers','armband-hint-button','armband-autoplay']) assert.ok(!system.includes(`bind('${gone}'`),gone+' unbound');
 // Context-only visibility: New Run at Game Over, Skip Voice while narrating.
 assert.match(source,/getElementById\('armband-newrun'\)\?\.setProperties\(\{ display: state\.gameOver \? 'flex' : 'none' \}/);
 assert.match(source,/getElementById\('armband-skip-voice'\)\?\.setProperties\(\{ display: state\.narrationBusy \? 'flex' : 'none' \}/);
 // Repeat and Play stay inert while Game Over is open.
 assert.match(source,/getElementById\('armband-play'\)\?\.setProperties\(\{\s*disabled: armbandPlayDisabled\(state\),?\s*\} as never\)/);
 // The render key tracks the context state so the slots refresh on change.
 assert.match(source,/state\.narrationBusy, state\.playLevel, cues\.join/);
 assert.match(system,/narrationBusy: this\.speech\.isBusy\(\), playLevel: this\.economy\.getPlayLevel\(\)/);
});
const gateSrc=source.slice(source.indexOf('export const armbandPlayDisabled'),source.indexOf('/** Shared by hand joints'));
const gateJs=ts.transpileModule(gateSrc,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {armbandPlayDisabled}=await import('data:text/javascript;base64,'+Buffer.from(gateJs).toString('base64'));
test('wrist Play grayed and inert while the Play modifier is unowned (Nov 17 feedback)',()=>{
 assert.equal(armbandPlayDisabled({gameOver:false,phase:'input',playLevel:0}),true);
 assert.equal(armbandPlayDisabled({gameOver:false,phase:'input',playLevel:1}),false);
 assert.equal(armbandPlayDisabled({gameOver:false,phase:'playback',playLevel:2}),true);
 assert.equal(armbandPlayDisabled({gameOver:true,phase:'input',playLevel:1}),true);
 assert.match(source,/disabled: armbandPlayDisabled\(state\)/);
 // The wrist binding itself refuses unowned Play, covering the UIKit click
 // path and the direct-press geometric path (both invoke the same action).
 const sysBinding=readFileSync('src/wall-tones/wall-tones-system.ts','utf8');
 assert.match(sysBinding,/bind\('armband-play', \(\) => \{ if \(this\.armbandUsable\(\) && this\.economy\.getPlayLevel\(\) >= 1\)/);
});
