import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const src = readFileSync('src/wall-tones/palm-projector.ts','utf8');
const js = ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {palmPanelPose, extendedFingerCount, PALM_PANEL_LIFT} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
// Left hand, palm up, fingers forward (+z), thumb side +x. Realistic metric proportions.
const openLeftUp = {
  wrist:{x:0,y:0,z:0},
  indexMcp:{x:0.045,y:0,z:0.085}, middleMcp:{x:0.01,y:0,z:0.09}, ringMcp:{x:-0.025,y:0,z:0.085}, pinkyMcp:{x:-0.055,y:0,z:0.075},
  indexTip:{x:0.05,y:0,z:0.16}, middleTip:{x:0.012,y:0,z:0.175}, ringTip:{x:-0.026,y:0,z:0.16}, pinkyTip:{x:-0.058,y:0,z:0.13},
};
test('open flat palm up reads openFlat with normal up and panel above mid-palm',()=>{
  const p = palmPanelPose(openLeftUp,'left');
  assert.equal(p.openFlat,true);
  assert.ok(p.normal.y > 0.95, `normal.y ${p.normal.y}`);
  assert.ok(Math.abs(p.center.y - PALM_PANEL_LIFT) < 1e-9, `center.y ${p.center.y}`);
  assert.ok(Math.abs(p.center.z - 0.045) < 1e-9, `center.z ${p.center.z}`);
  assert.ok(p.along.z > 0.95);
});
test('same geometry on the right hand also reads palm up (winding flip)',()=>{
  const mirrored = Object.fromEntries(Object.entries(openLeftUp).map(([k,v])=>[k,{x:-v.x,y:v.y,z:v.z}]));
  const p = palmPanelPose(mirrored,'right');
  assert.equal(p.openFlat,true);
  assert.ok(p.normal.y > 0.95);
});
test('a fist is not open even when palm up',()=>{
  const fist = {...openLeftUp,
    indexTip:{x:0.045,y:0.01,z:0.1}, middleTip:{x:0.01,y:0.01,z:0.105}, ringTip:{x:-0.025,y:0.01,z:0.1}, pinkyTip:{x:-0.05,y:0.01,z:0.09}};
  assert.equal(extendedFingerCount(fist),0);
  assert.equal(palmPanelPose(fist,'left').openFlat,false);
});
test('palm facing down is not flat-and-up',()=>{
  const down = Object.fromEntries(Object.entries(openLeftUp).map(([k,v])=>[k,{x:v.x,y:-v.y+0.0,z:v.z}]));
  // Flip hand over: mirror y of tips/mcps relative to wrist plane is y=0 here, so rotate 180 about z: x->-x,y->-y; left hand palm down.
  const flipped = Object.fromEntries(Object.entries(openLeftUp).map(([k,v])=>[k,{x:-v.x,y:-v.y,z:v.z}]));
  assert.equal(palmPanelPose(flipped,'left').openFlat,false);
  void down;
});
test('steeply tilted palm (about 60 degrees) is not flat enough',()=>{
  const t = Math.PI/3, c = Math.cos(t), s = Math.sin(t);
  const tilted = Object.fromEntries(Object.entries(openLeftUp).map(([k,v])=>[k,{x:v.x,y:v.z*s+v.y*c,z:v.z*c-v.y*s}]));
  assert.equal(palmPanelPose(tilted,'left').openFlat,false);
});
