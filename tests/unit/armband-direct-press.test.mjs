import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const src = readFileSync('src/wall-tones/armband-direct-press.ts','utf8');
const js = ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {directPressSample, directPressNext, DIRECT_PRESS_ENTER_M, DIRECT_PRESS_THROUGH_M, DIRECT_PRESS_HOVER_FRONT_M} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

// Axis-aligned button at the origin, 6cm x 2.3cm (a projector key at world scale).
const button = {
  center: {x:0, y:0, z:0},
  right: {x:1, y:0, z:0},
  up: {x:0, y:1, z:0},
  out: {x:0, y:0, z:1},
  halfWidth: 0.03, halfHeight: 0.0115,
};

test('finger hovering in front of the face hovers but does not press',()=>{
  const s = directPressSample({x:0, y:0, z:0.02}, button);
  assert.equal(s.hover, true);
  assert.equal(s.press, false);
  assert.equal(s.depth, 0);
});

test('finger at the face plane presses',()=>{
  const s = directPressSample({x:0.01, y:-0.004, z:DIRECT_PRESS_ENTER_M - 0.001}, button);
  assert.equal(s.hover, true);
  assert.equal(s.press, true);
});

test('finger through the face reports push depth, bounded by the punch-through allowance',()=>{
  const s = directPressSample({x:0, y:0, z:-0.005}, button);
  assert.equal(s.press, true);
  assert.ok(Math.abs(s.depth - 0.005) < 1e-9, `depth ${s.depth}`);
  const deep = directPressSample({x:0, y:0, z:-(DIRECT_PRESS_THROUGH_M + 0.002)}, button);
  assert.equal(deep.press, false, 'past punch-through is not a press');
  assert.equal(deep.hover, false, 'past the hover slab is not a hover');
});

test('finger beyond the hover front slab does nothing',()=>{
  const s = directPressSample({x:0, y:0, z:DIRECT_PRESS_HOVER_FRONT_M + 0.005}, button);
  assert.equal(s.hover, false);
  assert.equal(s.press, false);
});

test('off-center finger misses: outside the hover margin, then inside it',()=>{
  assert.equal(directPressSample({x:0.045, y:0, z:0}, button).hover, false);
  assert.equal(directPressSample({x:0.036, y:0, z:0}, button).hover, true);
  assert.equal(directPressSample({x:0.036, y:0, z:0}, button).press, false, 'hover margin is wider than the press margin');
});

test('rotated button: hit test runs in the button frame, not world axes',()=>{
  // Button rotated 90 deg about world Y: its face now looks down world -x.
  const rot = {
    center: {x:0.5, y:1.2, z:-0.3},
    right: {x:0, y:0, z:-1},
    up: {x:0, y:1, z:0},
    out: {x:-1, y:0, z:0},
    halfWidth: 0.03, halfHeight: 0.0115,
  };
  const inFront = {x:0.5 - 0.02, y:1.2, z:-0.3}; // 2cm along its out axis
  assert.equal(directPressSample(inFront, rot).hover, true);
  const touching = {x:0.5 - 0.002, y:1.2, z:-0.31};
  assert.equal(directPressSample(touching, rot).press, true);
  const behindBeyond = {x:0.5 + DIRECT_PRESS_THROUGH_M + 0.003, y:1.2, z:-0.3};
  assert.equal(directPressSample(behindBeyond, rot).press, false);
});

test('press fires once on entry, stays latched in the slab, re-arms after exit',()=>{
  let state = {hover:false, pressed:false};
  const step = (s)=>{ const r = directPressNext(state, s); state = r.state; return r.fire; };
  assert.equal(step(directPressSample({x:0,y:0,z:0.02}, button)), false, 'hover approach does not fire');
  assert.equal(step(directPressSample({x:0,y:0,z:0.001}, button)), true, 'crossing the face fires once');
  assert.equal(step(directPressSample({x:0,y:0,z:-0.004}, button)), false, 'holding through stays latched');
  assert.equal(step(directPressSample({x:0,y:0,z:0.02}, button)), false, 'backing off inside the slab stays latched');
  assert.equal(step(directPressSample({x:0,y:0,z:-0.002}, button)), false, 're-crossing without leaving the slab does not refire');
  assert.equal(step(directPressSample({x:0,y:0,z:0.08}, button)), false, 'leaving the slab rearms');
  assert.equal(step(directPressSample({x:0,y:0,z:0}, button)), true, 'next real poke fires again');
});
