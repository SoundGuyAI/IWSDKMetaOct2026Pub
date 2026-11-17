/** Raised physical keycaps for the palm projector. World-space faces, visual
 * travel and fingertip targets share one frame; UIKit keeps the base labels
 * and ray-click bindings. No flat-slab fallback is sampled at the same time. */
import { BoxGeometry, CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Object3D, type UIKitMLAsset } from '@iwsdk/core';
import type { ButtonFrameWorld } from './armband-direct-press.js';

export const RAISED_BUTTON_FRONT_M = 0.030;
export const RAISED_BUTTON_THICKNESS_M = 0.010;
export const RAISED_BUTTON_TRAVEL_M = 0.008;
export const RAISED_BUTTON_INSET = 0.88;
export function raisedButtonFrame(base: ButtonFrameWorld): ButtonFrameWorld {
  return { ...base,
    center: { x: base.center.x + base.out.x * RAISED_BUTTON_FRONT_M, y: base.center.y + base.out.y * RAISED_BUTTON_FRONT_M, z: base.center.z + base.out.z * RAISED_BUTTON_FRONT_M },
    halfWidth: base.halfWidth * RAISED_BUTTON_INSET,
    halfHeight: base.halfHeight * RAISED_BUTTON_INSET };
}
export const raisedButtonTravel = (depth: number): number => Math.min(RAISED_BUTTON_TRAVEL_M, Math.max(0, depth));
type Keycap = { mesh: Mesh; material: MeshBasicMaterial; label: Mesh; texture: CanvasTexture; canvas: HTMLCanvasElement; text: string; travelM: number; base: Matrix4; out: Vector3 };
const labels: Record<string,string> = { 'armband-repeat':'Repeat', 'armband-play':'Play', 'armband-newrun':'New Run', 'armband-skip-voice':'Skip Voice' };

export class ArmbandRaisedButtons {
  private readonly keys = new Map<string,Keycap>();
  hideAll(): void { for (const key of this.keys.values()) key.mesh.visible = false; }
  update(panel: UIKitMLAsset, id: string, el: Object3D): { frame: ButtonFrameWorld; active: boolean } {
    // UIKit writes matrices directly. Do not trust Object3D.scale or quaternion
    // decomposition: derive physical axes and extents from transformed points.
    el.updateWorldMatrix(true,false); panel.updateWorldMatrix(true,false);
    const center=el.localToWorld(new Vector3());
    const right=el.localToWorld(new Vector3(.5,0,0)).sub(center);
    const up=el.localToWorld(new Vector3(0,.5,0)).sub(center);
    const halfWidth=right.length(),halfHeight=up.length();
    right.normalize();up.normalize();const out=new Vector3().crossVectors(right,up).normalize();
    const frame=raisedButtonFrame({center,right,up,out,halfWidth,halfHeight});
    const props=(el as unknown as {properties?:{peek?:()=>{disabled?:boolean}}}).properties?.peek?.();
    const active=props?.disabled !== true && halfWidth>1e-6 && halfHeight>1e-6;
    let key=this.keys.get(id);
    if(!key){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
      const texture=new CanvasTexture(canvas);
      const material=new MeshBasicMaterial({color:0x306b8e,depthTest:true});
      const mesh=new Mesh(new BoxGeometry(1,1,1),material);mesh.name='raised-'+id;mesh.matrixAutoUpdate=false;
      const label=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({map:texture,transparent:true,depthTest:true}));
      label.position.z=.501;label.scale.set(.93,.88,1);mesh.add(label);panel.add(mesh);
      key={mesh,material,label,texture,canvas,text:'',travelM:0,base:new Matrix4(),out:new Vector3()};this.keys.set(id,key);
    }
    const labelEl=panel.getElementById(id+'-label') as unknown as {properties?:{peek?:()=>{text?:string}}}|null;
    const text=labelEl?.properties?.peek?.().text || labels[id] || id;
    if(key.text!==text){
      const ctx=key.canvas.getContext('2d')!;ctx.clearRect(0,0,512,128);ctx.fillStyle='#ffffff';ctx.font='bold 56px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,480);key.texture.needsUpdate=true;key.text=text;
    }
    // The panel reapplies its overlay flags to descendants every tick.
    // Restore opaque keycap depth and draw its face after the base labels.
    key.mesh.renderOrder=21;key.label.renderOrder=22;
    key.material.depthWrite=true;key.material.depthTest=true;
    (key.label.material as MeshBasicMaterial).depthTest=true;
    (key.label.material as MeshBasicMaterial).depthWrite=false;
    key.material.color.setHex(active ? 0x306b8e : 0x4b5157);
    (key.label.material as MeshBasicMaterial).opacity=active?1:.4;
    const face=new Vector3(frame.center.x,frame.center.y,frame.center.z);
    const world=new Matrix4().makeBasis(right,up,out).scale(new Vector3(frame.halfWidth*2,frame.halfHeight*2,RAISED_BUTTON_THICKNESS_M));
    world.setPosition(face.addScaledVector(out,-RAISED_BUTTON_THICKNESS_M/2));
    key.base.copy(new Matrix4().copy(panel.matrixWorld).invert().multiply(world));
    key.out.copy(out).transformDirection(new Matrix4().copy(panel.matrixWorld).invert());
    key.mesh.matrix.copy(key.base);key.mesh.matrixWorldNeedsUpdate=true;key.mesh.visible=true;
    return {frame,active};
  }
  /** Return zero so the UIKit base plate stays still; only the keycap travels. */
  push(id:string,depth:number):number {
    const key=this.keys.get(id);if(!key)return 0;
    key.travelM=raisedButtonTravel(depth);
    // Translate in world meters, then transform the resulting matrix back into
    // panel-local space. This also works under a scaled player rig.
    const parent=key.mesh.parent!;parent.updateWorldMatrix(true,false);
    const world=new Matrix4().multiplyMatrices(parent.matrixWorld,key.base);
    const out=new Vector3().setFromMatrixColumn(world,2).normalize();
    const position=new Vector3().setFromMatrixPosition(world).addScaledVector(out,-key.travelM);
    world.setPosition(position);key.mesh.matrix.copy(new Matrix4().copy(parent.matrixWorld).invert().multiply(world));key.mesh.matrixWorldNeedsUpdate=true;
    return 0;
  }
      }
