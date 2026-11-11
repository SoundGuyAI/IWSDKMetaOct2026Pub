import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../src/wall-tones/panel-placement.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {selectionPanelPose,horizontalLookAway,panelOverlapsPad}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const eye={x:0,y:1.65,z:0},forward={x:0,y:0,z:-1};
test('air and wall menu lower edge clears head/eye for different panel heights',()=>{
 for(const air of [true,false])for(const h of [.6,1.1,1.8]){
  const p=selectionPanelPose(eye,forward,h,1.7,air);const tilt=Math.atan2(p.y-eye.y,1.7);
  assert.ok(p.y-h*Math.cos(tilt)/2>=eye.y+(air?.25:.10));
 }
});
test('vertical panel clearance cannot falsely trigger horizontal follow threshold',()=>{
 assert.equal(horizontalLookAway(eye,forward,{x:0,y:8,z:-1.7}),0);
 const a=49*Math.PI/180;assert.ok(horizontalLookAway(eye,forward,{x:Math.sin(a),y:5,z:-Math.cos(a)})<50);
 const b=51*Math.PI/180;assert.ok(horizontalLookAway(eye,forward,{x:Math.sin(b),y:5,z:-Math.cos(b)})>50);
});
test('wall panel rejects pad overlap and accepts clear space on same wall',()=>{
 const p={x:0,y:1.65,z:-2},r={x:1,y:0,z:0},n={x:0,y:0,z:1};
 assert.equal(panelOverlapsPad(p,r,n,1,.8,{x:.2,y:1.6,z:-2},1),true);
 assert.equal(panelOverlapsPad(p,r,n,1,.8,{x:2,y:1.6,z:-2},1),false);
 assert.equal(panelOverlapsPad(p,r,n,1,.8,{x:0,y:1.6,z:-4},1),false);
});
// Exercise the actual follow method, not a separate reimplementation.
const sys=readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts',import.meta.url),'utf8');
function method(name){const start=sys.indexOf('private '+name+'(');assert.ok(start>=0);const end=sys.indexOf('\nprivate ',start+8);return sys.slice(start,end<0?undefined:end).replace(/\n\/\*\*[\s\S]*$/,'');}
const harnessJs=ts.transpileModule('class Harness { '+method('tickSetupPanelFollow')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {Vector3,Quaternion,Matrix4}=await import('@iwsdk/core');
const Harness=new Function('Transform','PANEL_FOLLOW_DISTANCE_M','PANEL_FOLLOW_Y_OFFSET_M','PANEL_FOLLOW_SCALE','PANEL_LOOK_AWAY_DEG','PANEL_FOLLOW_SLERP','PANEL_SNAP_ARRIVE_M','selectionPanelPose','horizontalLookAway','Vector3',harnessJs+';return Harness;')({},1.7,.06,.3,34,.12,.04,selectionPanelPose,horizontalLookAway,Vector3);
function followFixture(){
 const h=new Harness(),position=[0,1.65,-1.7],orientation=[0,0,0,1],scale=[.3,.3,.3];
 Object.assign(h,{flowPhase:'wall-picking',panelDragging:false,panelWorldAnchored:false,panelPositionSaved:false,viewer:new Vector3(),headQuat:new Quaternion(),ghostForward:new Vector3(),panelFollowPos:new Vector3(),panelFollowQuat:new Quaternion(),panelFollowTargetPos:new Vector3(),panelFollowTargetQuat:new Quaternion(),savedPanelPosition:new Float32Array(3),savedPanelScale:new Float32Array(3),panelMatrix:new Matrix4(),world:{getSceneEntity:()=>({getVectorView:(_,key)=>({position,orientation,scale})[key]})},player:{head:{getWorldPosition:v=>v.copy(eye),getWorldQuaternion:q=>q.identity()}},isSetupPanelFollowActive:()=>true,panelWorldSize:()=>({width:1,height:1.2}),restorePanelPointerCapture:()=>{}});
 return {h,position};
}
test('production follow elevates placement and does not chase head/ray motion during a snap',()=>{
 const {h,position}=followFixture();h.tickSetupPanelFollow(1/72);assert.ok(position[1]>eye.y+.5);
 h.panelSnapActive=true;const frozen=h.panelFollowTargetPos.clone();h.player.head.getWorldQuaternion=q=>q.setFromAxisAngle(new Vector3(0,1,0),Math.PI/3);h.tickSetupPanelFollow(1/72);assert.deepEqual(h.panelFollowTargetPos.toArray(),frozen.toArray());
});
test('production follow ignores 49degree yaw but reanchors after 51degree yaw',()=>{
 const {h}=followFixture();h.tickSetupPanelFollow(1/72);h.panelSnapActive=false;const original=h.panelFollowTargetPos.clone();
 h.player.head.getWorldQuaternion=q=>q.setFromAxisAngle(new Vector3(0,1,0),49*Math.PI/180);h.tickSetupPanelFollow(1/72);assert.deepEqual(h.panelFollowTargetPos.toArray(),original.toArray());
 h.player.head.getWorldQuaternion=q=>q.setFromAxisAngle(new Vector3(0,1,0),51*Math.PI/180);h.tickSetupPanelFollow(1/72);assert.notDeepEqual(h.panelFollowTargetPos.toArray(),original.toArray());
});
const {rectangleInsidePolygon}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../src/wall-tones/panel-placement.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('fit check uses real polygon, not only bounding rectangle',()=>{
 const rect=[{x:-.5,z:-.5},{x:-.5,z:.5},{x:.5,z:.5},{x:.5,z:-.5}];
 assert.equal(rectangleInsidePolygon(rect,[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}]),true);
 assert.equal(rectangleInsidePolygon(rect,[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:.1,z:2},{x:.1,z:0},{x:-.1,z:0},{x:-.1,z:2},{x:-2,z:2}]),false);
 assert.equal(rectangleInsidePolygon(rect,[]),false);
});
const rayHarnessJs=ts.transpileModule('class RayHarness { '+method('findRayHoveredSlot')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const RayHarness=new Function('XR_HANDS',rayHarnessJs+';return RayHarness;')(['left','right']);
test('actual surface-ray picker blocks only the menu hand, not the other hand',()=>{
 const h=new RayHarness();const slot={selected:false,transform:{sizeM:1},root:{getWorldPosition:v=>v.set(0,1,-2)}};
 const ray={updateWorldMatrix:()=>{},getWorldPosition:v=>v.set(0,1,0),getWorldQuaternion:q=>q.identity()};
 Object.assign(h,{placementPadSizeM:()=>1,handPointsAtPanel:hand=>hand==='left',slotCandidates:[slot],input:{xr:{visualAdapters:{left:{peek:()=>({connected:true})},right:{peek:()=>({connected:true})}}}},player:{raySpaces:{left:ray,right:ray}},rayOrigin:new Vector3(),rayDir:new Vector3(),gripQuat:new Quaternion(),padWorldPos:new Vector3(),rayToSlot:new Vector3(),rayClosest:new Vector3()});
 assert.equal(h.findRayHoveredSlot('left'),null);assert.equal(h.findRayHoveredSlot('right'),slot);
});
const airHarnessJs=ts.transpileModule('class AirHarness { '+method('tickAirPlacement')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const AirHarness=new Function('solidifyGhostPad','XRAnchor',airHarnessJs+';return AirHarness;')(()=>{throw new Error('UI pinch incorrectly placed pad');},{});
test('actual air-placement path consumes a UI-hand pinch without placing a pad',()=>{
 const h=new AirHarness();Object.assign(h,{resolvePlacementHand:()=> 'left',ghostPad:{},updateGhostPadPose:()=>{},input:{xr:{getSelectState:()=>({start:true})}},handPointsAtPanel:()=>true,panelDragActiveHands:new Set(),airPlaceStep:0,pads:[]});
 h.tickAirPlacement(1/72);assert.equal(h.airPlaceStep,0);assert.equal(h.pads.length,0);
});
const parkJs=ts.transpileModule('class ParkHarness { '+method('tryParkPanelOnWall')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let suppliedWalls=[];
const ParkHarness=new Function('collectVerticalWalls','PANEL_PLAY_SCALE','Vector3','panelOverlapsPad','rectangleInsidePolygon',parkJs+';return ParkHarness;')(()=>suppliedWalls,.28,Vector3,panelOverlapsPad,rectangleInsidePolygon);
const {Object3D}=await import('@iwsdk/core');
function wall(x,z,width=4,height=3,side=false){
 const object3D=new Object3D();object3D.position.set(x,eye.y,z);
 if(side)object3D.rotation.z=-Math.PI/2;else object3D.rotation.x=Math.PI/2;
 object3D.updateMatrixWorld(true);
 return {widthM:width,center:{x,y:eye.y,z},normal:side?{x:1,y:0,z:0}:{x:0,y:0,z:1},entity:{object3D},localMinX:-width/2,localMaxX:width/2,localMinZ:-height/2,localMaxZ:height/2,plane:{polygon:[{x:-width/2,z:-height/2},{x:width/2,z:-height/2},{x:width/2,z:height/2},{x:-width/2,z:height/2}]}};
}
function parkFixture(walls,pads=[]){
 suppliedWalls=walls;const h=new ParkHarness();let placed=null;
 Object.assign(h,{planeEntityScratch:[],queries:{planes:{entities:[]}},viewer:new Vector3(eye.x,eye.y,eye.z),ghostForward:new Vector3(0,0,-1),panelWorldSize:()=>({width:1,height:.8}),panelCorner:new Vector3(),padWorldPos:new Vector3(),pads,panelMatrix:new Matrix4(),panelFollowTargetQuat:new Quaternion(),applyPanelLayout:(x,y,z)=>{placed={x,y,z}}});return {h,placed:()=>placed};
}
test('actual play planner prefers a fitting front wall over an adjacent wall',()=>{
 const f=parkFixture([wall(-3,-1,4,3,true),wall(0,-3)]);assert.equal(f.h.tryParkPanelOnWall(),true);assert.ok(Math.abs(f.placed().x)<.1);assert.ok(f.placed().z< -2.8);
});
test('actual play planner skips pad-blocked front wall for adjacent space',()=>{
 const pad={sizeM:4,root:{getWorldPosition:v=>v.set(0,eye.y,-3)}};
 const f=parkFixture([wall(0,-3),wall(-3,-1,4,3,true)],[pad]);assert.equal(f.h.tryParkPanelOnWall(),true);assert.ok(f.placed().x< -2.8);
});
test('actual play planner never picks behind and returns floating fallback when nothing fits',()=>{
 for(const walls of [[wall(0,3)],[wall(0,-3,.4,.4)],[]]){const f=parkFixture(walls);assert.equal(f.h.tryParkPanelOnWall(),false);assert.equal(f.placed(),null);}
});

test('actual wall planner searches beyond the center and old fixed offsets',()=>{
 const pad={sizeM:2,root:{getWorldPosition:v=>v.set(0,eye.y,-3)}};
 const f=parkFixture([wall(0,-3,7,3)],[pad]);
 assert.equal(f.h.tryParkPanelOnWall(),true);
 assert.ok(Math.abs(f.placed().x)>1.5);
});

test('actual planner uses forward part of an adjacent wall whose origin is alongside viewer',()=>{
 const f=parkFixture([wall(-3,0,5,3,true)]);
 assert.equal(f.h.tryParkPanelOnWall(),true);
 assert.ok(f.placed().z<0);
});

const dragJs=ts.transpileModule('class DragHarness { '+method('tickPanelDrag')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const DragHarness=new Function('XR_HANDS','PANEL_PLAY_DISTANCE_M','PANEL_FOLLOW_DISTANCE_M','PANEL_PLAY_SCALE','PANEL_FOLLOW_SCALE','Vector3',dragJs+';return DragHarness;')(['left','right'],1.2,1.7,.28,.3,Vector3);
test('actual setup header drag cancels an in-flight follow snap',()=>{
 const h=new DragHarness();
 Object.assign(h,{useDesktopPath:()=>false,flowPhase:'wall-picking',panelSnapActive:true,panelDragSkipHands:new Set(),panelDragActiveHands:new Set(),input:{xr:{getSelectState:()=>({start:true,active:true})}},handPointsAtPanel:()=>true,player:{raySpaces:{left:{getWorldPosition:v=>v.set(0,1.3,0),getWorldQuaternion:q=>q.identity()}},head:{getWorldPosition:v=>v.copy(eye),getWorldQuaternion:q=>q.identity()}},rayOrigin:new Vector3(),gripQuat:new Quaternion(),rayDir:new Vector3(),panelFollowTargetPos:new Vector3(),panelFollowPos:new Vector3(),panelWorldSize:()=>({height:1,width:1}),viewer:new Vector3(),headQuat:new Quaternion(),panelMatrix:new Matrix4(),applyPanelLayout:()=>{}});
 h.tickPanelDrag();assert.equal(h.panelSnapActive,false);assert.equal(h.panelDragging,true);
});

// Use both production input methods: real per-hand ray target selection feeds
// the per-pinch drag latch, rather than stubbing the latch's hover decision.
const inputJs=ts.transpileModule('class InputHarness { '+method('tickPanelDrag')+' '+method('handPointsAtPanel')+' }',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const InputHarness=new Function('XR_HANDS','PANEL_PLAY_DISTANCE_M','PANEL_FOLLOW_DISTANCE_M','PANEL_PLAY_SCALE','PANEL_FOLLOW_SCALE','Vector3',inputJs+';return InputHarness;')(['left','right'],1.2,1.7,.28,.3,Vector3);
function inputFixture(phase='playing'){
 const h=new InputHarness(),header={},panel={getElementById:id=>id==='wall-tones-panel-header'?header:null};
 const states={left:{start:false,active:false},right:{start:false,active:false}},hits={left:'wall',right:'wall'},layouts=[];let currentHand;
 const rays=Object.fromEntries(['left','right'].map(hand=>[hand,{updateWorldMatrix:()=>{currentHand=hand;},getWorldPosition:v=>v.set(hand==='left'?-.2:.2,1.3,0),getWorldQuaternion:q=>q.identity()}]));
 Object.assign(h,{useDesktopPath:()=>false,flowPhase:phase,panelSnapActive:true,panelDragging:false,panelDragSkipHands:new Set(),panelDragActiveHands:new Set(),input:{xr:{getSelectState:hand=>states[hand]}},world:{getSceneObject:()=>panel},panelRaycaster:{ray:{origin:new Vector3(),direction:new Vector3()},intersectObject:(target,recursive,out)=>{if(hits[currentHand]==='header'||(target===panel&&hits[currentHand]==='button'))out.push({distance:1});}},panelRayHits:[],player:{raySpaces:rays,head:{getWorldPosition:v=>v.copy(eye),getWorldQuaternion:q=>q.identity()}},rayOrigin:new Vector3(),gripQuat:new Quaternion(),rayDir:new Vector3(),panelFollowTargetPos:new Vector3(),panelFollowPos:new Vector3(),panelWorldSize:()=>({height:1,width:1}),viewer:new Vector3(),headQuat:new Quaternion(),panelMatrix:new Matrix4(),applyPanelLayout:(...args)=>layouts.push(args),renderPanel:()=>{}});
 return {h,states,hits,layouts};
}
test('production gameplay routing: wall, pad, empty-space and UI-button pinches never move panel',()=>{
 for(const hand of ['left','right'])for(const target of ['wall','pad','empty','button']){
  const f=inputFixture();f.hits[hand]=target;f.states[hand]={start:true,active:true};f.h.tickPanelDrag();
  assert.equal(f.layouts.length,0,`${hand} ${target}`);assert.equal(f.h.panelDragging,false);assert.equal(f.h.panelSnapActive,true);
  // Moving a held gameplay pinch onto the header must not convert it to drag.
  f.hits[hand]='header';f.states[hand]={start:false,active:true};f.h.tickPanelDrag();assert.equal(f.layouts.length,0);
  f.states[hand]={start:false,active:false};f.h.tickPanelDrag();assert.equal(f.h.panelDragSkipHands.size,0);
 }
});
test('production header drag/drop works in play and setup, latches until release and can regrab',()=>{
 for(const phase of ['playing','wall-picking','air-placement'])for(const hand of ['left','right']){
  const f=inputFixture(phase);f.hits[hand]='header';f.states[hand]={start:true,active:true};f.h.tickPanelDrag();
  assert.equal(f.layouts.length,1,`${phase} ${hand}`);assert.equal(f.h.panelDragging,true);assert.equal(f.h.panelSnapActive,false);
  f.hits[hand]='wall';f.states[hand]={start:false,active:true};f.h.tickPanelDrag();assert.equal(f.layouts.length,2);
  const drop=f.layouts.at(-1);f.states[hand]={start:false,active:false};f.h.tickPanelDrag();assert.equal(f.h.panelDragging,false);assert.equal(f.h.panelDragActiveHands.size,0);
  f.states[hand]={start:true,active:true};f.h.tickPanelDrag();assert.equal(f.layouts.length,2);assert.deepEqual(f.layouts.at(-1),drop);
  f.states[hand]={start:false,active:false};f.h.tickPanelDrag();f.hits[hand]='header';f.states[hand]={start:true,active:true};f.h.tickPanelDrag();assert.equal(f.layouts.length,3);
 }
});
test('production setup placement and UI buttons do not arm dragging',()=>{
 for(const phase of ['wall-picking','air-placement'])for(const target of ['wall','button']){
  const f=inputFixture(phase);f.hits.left=target;f.states.left={start:true,active:true};f.h.tickPanelDrag();assert.equal(f.layouts.length,0);
 }
});
