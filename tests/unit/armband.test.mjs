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
