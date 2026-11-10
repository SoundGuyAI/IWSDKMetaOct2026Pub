/** Pure geometry shared by the MR menu and its regression tests. */
export type Point3 = {x:number; y:number; z:number};
export function selectionPanelPose(viewer:Point3, forward:Point3, height:number, distance:number, air:boolean) {
 const len=Math.hypot(forward.x,forward.z)||1;
 // Reserve the full half-height before tilt. Tilting only reduces the vertical
 // projection, so the lower edge cannot dip below this clearance.
 return {x:viewer.x+forward.x/len*distance,y:viewer.y+(air?0.25:0.10)+height/2,z:viewer.z+forward.z/len*distance};
}
export function horizontalLookAway(viewer:Point3, forward:Point3, panel:Point3) {
 const x=panel.x-viewer.x,z=panel.z-viewer.z;
 const len=Math.hypot(x,z)*Math.hypot(forward.x,forward.z);
 return len<1e-8?0:Math.acos(Math.max(-1,Math.min(1,(x*forward.x+z*forward.z)/len)))*180/Math.PI;
}
export function panelOverlapsPad(panel:Point3, right:Point3, normal:Point3, width:number,height:number,pad:Point3,size:number) {
 const x=pad.x-panel.x,y=pad.y-panel.y,z=pad.z-panel.z;
 // Conservative square pad bounds. A wall on another plane does not block.
 return Math.abs(x*normal.x+z*normal.z)<size/2+0.18 && Math.abs(x*right.x+z*right.z)<width/2+size/2+0.12 && Math.abs(y)<height/2+size/2+0.12;
}
export function rectangleInsidePolygon(corners:{x:number;z:number}[],polygon:{x:number;z:number}[]):boolean {
 if(polygon.length<3)return false;
 const inside=(p:{x:number;z:number})=>{
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[i]!,b=polygon[j]!;
   if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;
  }return yes;
 };
 if(!corners.every(inside))return false;
 const cross=(a:{x:number;z:number},b:{x:number;z:number},c:{x:number;z:number})=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 for(let i=0;i<corners.length;i++)for(let j=0;j<polygon.length;j++){
  const a=corners[i]!,b=corners[(i+1)%corners.length]!,c=polygon[j]!,d=polygon[(j+1)%polygon.length]!;
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return false;
 }
 return true;
}
