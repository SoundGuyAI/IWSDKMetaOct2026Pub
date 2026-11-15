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
test('panel lift keeps the hand and its outline clear when looking up (Nov 16 feedback)',()=>{
  assert.ok(PALM_PANEL_LIFT >= 0.17, `lift ${PALM_PANEL_LIFT} too low`);
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

const {palmOpenState, OneEuro, PalmJointsSmoother, PALM_OPEN_UP_MIN, PALM_STILL_UP_MIN} =
  await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('hysteresis: borderline pose holds the previous open state',()=>{
  // Open flat hand opens the gate.
  assert.equal(palmOpenState(openLeftUp,'left',false),true);
  // Two extended fingers and a mildly tilted palm: neither opens nor closes.
  const borderline = {...openLeftUp,
    ringTip:{x:-0.025,y:0.01,z:0.1}, pinkyTip:{x:-0.05,y:0.01,z:0.09}};
  assert.equal(extendedFingerCount(borderline),2);
  assert.equal(palmOpenState(borderline,'left',true),true,'stays open');
  assert.equal(palmOpenState(borderline,'left',false),false,'stays closed');
  // A fist closes it outright.
  const fist = {...openLeftUp,
    indexTip:{x:0.045,y:0.01,z:0.1}, middleTip:{x:0.01,y:0.01,z:0.105}, ringTip:{x:-0.025,y:0.01,z:0.1}, pinkyTip:{x:-0.05,y:0.01,z:0.09}};
  assert.equal(palmOpenState(fist,'left',true),false);
  // Tilted far past level also closes it.
  const t = Math.PI/3, c = Math.cos(t), s = Math.sin(t);
  const tilted = Object.fromEntries(Object.entries(openLeftUp).map(([k,v])=>[k,{x:v.x,y:v.z*s+v.y*c,z:v.z*c-v.y*s}]));
  assert.equal(palmOpenState(tilted,'left',true),false);
});

test('OneEuro: heavy damping of fast jitter, faithful slow tracking',()=>{
  const f = new OneEuro();
  const dt = 1/90;
  // Jitter: +-3 mm at ~11 Hz around 0.5 m.
  let peak = 0;
  for (let i = 0; i < 200; i++) {
    const t = i*dt;
    const x = 0.5 + 0.003*Math.sin(2*Math.PI*11*t);
    const y = f.filter(x, dt);
    if (i > 30) peak = Math.max(peak, Math.abs(y - 0.5));
  }
  assert.ok(peak < 0.001, `jitter damped to ${(peak*1000).toFixed(2)} mm`);
  // Slow drift of 0.2 m/s is tracked within ~4 cm.
  const g = new OneEuro();
  let err = 0;
  for (let i = 0; i < 300; i++) {
    const x = i*dt*0.2;
    err = Math.abs(g.filter(x, dt) - x);
  }
  assert.ok(err < 0.04, `drift lag ${(err*1000).toFixed(1)} mm`);
  // Constant input settles exactly.
  const h = new OneEuro();
  let last = 0;
  for (let i = 0; i < 400; i++) last = h.filter(0.7, dt);
  assert.ok(Math.abs(last - 0.7) < 1e-4);
});

test('PalmJointsSmoother smooths every joint and resets',()=>{
  const s = new PalmJointsSmoother();
  const dt = 1/90;
  // Feed a static open hand with +-2 mm injected noise per joint per frame.
  let out;
  for (let i = 0; i < 120; i++) {
    const noisy = Object.fromEntries(Object.entries(openLeftUp).map(([k,v],j)=>
      [k,{x:v.x+0.002*Math.sin(i*1.7+j), y:v.y+0.002*Math.cos(i*2.3+j*2), z:v.z}]));
    out = s.filter(noisy, dt);
  }
  const p = palmPanelPose(out,'left');
  assert.equal(p.openFlat,true,'smoothed joints still read open flat');
  // Smoothed wrist stays within 1 mm of the true value.
  assert.ok(Math.abs(out.wrist.x - openLeftUp.wrist.x) < 0.001);
  s.reset();
  const fresh = s.filter(openLeftUp, dt);
  assert.ok(Math.abs(fresh.wrist.x - openLeftUp.wrist.x) < 1e-9,'reset passes input through');
  void PALM_OPEN_UP_MIN; void PALM_STILL_UP_MIN;
});
