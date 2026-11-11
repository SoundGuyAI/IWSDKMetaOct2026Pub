import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '@iwsdk/core';
const source=readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts',import.meta.url),'utf8');
const body=source.split('private tickPanelRayDodge(): boolean {')[1].split('\nprivate ')[0].trim().replace(/}\s*$/,'');
const run=new Function('XR_HANDS','PANEL_DRAG_DODGE_COOLDOWN_MS','PANEL_RAY_DODGE_UP_M','PANEL_RAY_DODGE_HOLD_MS','PANEL_RAY_BLOCK_DEG',body);
function fixture({flow='wall-picking',target=null}={}) {
 return {flowPhase:flow,panelDragDoneAt:-Infinity,panelDodgeUntil:999999,
 panelFollowPos:new Vector3(0,1.6,-1),viewer:new Vector3(0,1.6,0),panelDodgeTargetPos:new Vector3(0,1.6,-1),
 panelDodgeScratchA:new Vector3(),panelDodgeScratchB:new Vector3(),rayOrigin:new Vector3(),rayDir:new Vector3(0,0,-1),
 findRayHoveredSlot:()=>target};
}
const tick=f=>run.call(f,['left','right'],600,0.4,1000,20);
test('empty space cannot dodge, including when a previous dodge hold was active',()=>{
 const f=fixture();assert.equal(tick(f),false);assert.equal(f.panelDodgeUntil,0);assert.equal(f.panelDodgeTargetPos.y,1.6);
});
test('menu and play never dodge even with a candidate supplied',()=>{
 for(const flow of ['choose-mode','scanning','air-placement','playing'])assert.equal(tick(fixture({flow,target:{selected:false}})),false);
});
test('unselected slot behind the panel lifts upward only, selected slot does not',()=>{
 const f=fixture({target:{selected:false}});assert.equal(tick(f),true);assert.deepEqual(f.panelDodgeTargetPos.toArray(),[0,2,-1]);
 assert.equal(tick(fixture({target:{selected:true}})),false);
});
test('slot ray away from the panel and post-drag cooldown do not dodge',()=>{
 const f=fixture({target:{selected:false}});f.rayDir.set(1,0,0);assert.equal(tick(f),false);
 const g=fixture({target:{selected:false}});g.panelDragDoneAt=performance.now();assert.equal(tick(g),false);
});
