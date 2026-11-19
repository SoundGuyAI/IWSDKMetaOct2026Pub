import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const src = readFileSync('src/rift-lab/rift-hands.ts','utf8');
const js = ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {HandPoseFreshness, HAND_POSE_STALE_MS} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

function joints(seed){
  const b = new Float32Array(25*16);
  for (let i=0;i<b.length;i++) b[i] = seed + i*0.001;
  return b;
}

test('changing joints stay live',()=>{
  const f = new HandPoseFreshness();
  assert.equal(f.isLive('left', joints(1), 0), true);
  assert.equal(f.isLive('left', joints(2), 50), true);
  assert.equal(f.isLive('left', joints(3), HAND_POSE_STALE_MS + 100), true);
});

test('frozen joints go stale after the threshold',()=>{
  const f = new HandPoseFreshness();
  const b = joints(7);
  assert.equal(f.isLive('left', b, 1000), true);
  assert.equal(f.isLive('left', b, 1000 + HAND_POSE_STALE_MS - 1), true);
  assert.equal(f.isLive('left', b, 1000 + HAND_POSE_STALE_MS), false);
  assert.equal(f.isLive('left', b, 1000 + HAND_POSE_STALE_MS*5), false);
});

test('tracking recovery goes live again and hands are independent',()=>{
  const f = new HandPoseFreshness();
  const b = joints(7);
  assert.equal(f.isLive('left', b, 0), true);
  assert.equal(f.isLive('left', b, HAND_POSE_STALE_MS + 1), false);
  assert.equal(f.isLive('left', joints(8), HAND_POSE_STALE_MS + 2), true);
  // right hand untouched by left's history
  assert.equal(f.isLive('right', b, HAND_POSE_STALE_MS*10), true);
});

test('zeroed buffer freezes like a lost hand',()=>{
  const f = new HandPoseFreshness();
  const z = new Float32Array(25*16);
  assert.equal(f.isLive('left', z, 0), true);
  assert.equal(f.isLive('left', z, HAND_POSE_STALE_MS + 1), false);
});
