import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/wall-tones/armband-raised-buttons.ts','utf8');
const pure=source.slice(source.indexOf('export const RAISED_BUTTON_FRONT_M'),source.indexOf('type Keycap'));
const load=async src=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const {raisedButtonFrame,raisedButtonTravel}=await load(pure);
const {directPressSample}=await load(readFileSync('src/wall-tones/armband-direct-press.ts','utf8'));
const base={center:{x:0,y:0,z:0},right:{x:1,y:0,z:0},up:{x:0,y:1,z:0},out:{x:0,y:0,z:1},halfWidth:.03,halfHeight:.012};
test('raised face is 30mm in front of the plate with matching inset extents',()=>{
 const face=raisedButtonFrame(base);assert.equal(face.center.z,.03);assert.equal(face.halfWidth,.03*.88);assert.equal(face.halfHeight,.012*.88);assert.equal(base.center.z,0);
 assert.equal(directPressSample({x:0,y:0,z:.029},face).press,true);
 assert.equal(directPressSample({x:0,y:0,z:0},face).press,false,'old flat plate cannot double-fire raised target');
 assert.equal(directPressSample({x:0,y:0,z:.05},face).press,false,'approaching raised face only hovers');
});
test('raised face follows panel orientation rather than a fixed world axis',()=>{
 const face=raisedButtonFrame({...base,center:{x:2,y:3,z:4},out:{x:0,y:1,z:0}});assert.equal(face.center.y,3.03);assert.equal(face.center.z,4);
});
test('keycap travel clamps to 8mm and springs back without moving the base plate',()=>{
 assert.equal(raisedButtonTravel(-.01),0);assert.equal(raisedButtonTravel(.004),.004);assert.equal(raisedButtonTravel(.03),.008);assert.equal(raisedButtonTravel(0),0);
});
test('raised geometry and samples share the frame; disabled keys reset without firing',()=>{
 const system=readFileSync('src/wall-tones/wall-tones-system.ts','utf8');assert.match(system,/directPressSample\([^;]+frame\)/);assert.match(system,/if \(!raised\.active\)/);assert.match(source,/props\?\.disabled !== true/);assert.match(system,/const pushPx = this\.armband!\.raisedButtons\.push/);
});
