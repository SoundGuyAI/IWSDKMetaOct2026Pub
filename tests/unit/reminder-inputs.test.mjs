import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let source='';
for(const name of ['../nod-lab/head-gesture','../thumbs-lab/thumbs-gesture','../nod-lab/pointer-gesture','../nod-lab/tilt-gesture','reminder-inputs']) {
 let s=readFileSync(new URL('../../src/wall-tones/'+name+'.ts',import.meta.url),'utf8');
 s=s.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*$/gm,'');
 // Both detector modules export same answer type, equivalent and erased.
 s=s.replace(/export type YesNoAnswer = 'yes' \| 'no';/,'');
 source+='\n'+s;
}
source="type YesNoAnswer='yes'|'no';type ReminderAnswer=YesNoAnswer|null;\n"+source;
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ReminderInputs}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
class Target extends EventTarget {constructor(){super();this.document=new EventTarget();this.document.hidden=false;this.screen={orientation:{angle:0}};}setTimeout(...a){return setTimeout(...a)}clearTimeout(t){clearTimeout(t)}}
test('first binary answer wins and prompt listeners detach immediately',async()=>{
 const target=new Target(),i=new ReminderInputs();let count=0;const p=i.ask(target,false).then(a=>{count++;return a});i.answer('yes');i.answer('no');assert.equal(await p,'yes');assert.equal(i.listening,false);assert.equal(count,1);
});
test('new prompt cancels old; timeout and hiding are quiet bounded dismissals',async()=>{
 const target=new Target(),i=new ReminderInputs();const old=i.ask(target,false),next=i.ask(target,false,10);assert.equal(await old,null);assert.equal(await next,null);const hidden=i.ask(target,false);target.document.hidden=true;target.document.dispatchEvent(new Event('visibilitychange'));assert.equal(await hidden,null);assert.equal(i.listening,false);
});
test('keyboard answers only during an active prompt and Escape declines',async()=>{
 const target=new Target(),i=new ReminderInputs();const p=i.ask(target,false);const e=new Event('keydown');e.key='y';target.dispatchEvent(e);assert.equal(await p,'yes');const q=i.ask(target,true);const esc=new Event('keydown');esc.key='Escape';target.dispatchEvent(esc);assert.equal(await q,'no');
});

test('immersive prompt accepts head nod without tracked hands and stops after the first answer',async()=>{
 const target=new Target(),i=new ReminderInputs();const p=i.ask(target,true);
 const deg=x=>x*Math.PI/180;
 for(const [t,pitch] of [[0,0],[.1,8],[.2,16],[.3,8],[.4,0],[.5,-8],[.6,-16],[.7,-8],[.8,0]])i.feedImmersive(deg(pitch),0,null,null,t);
 assert.equal(await p,'yes');assert.equal(i.listening,false);
});

test('immersive prompt accepts thumbs without a head-pose sample',async()=>{
 const target=new Target(),i=new ReminderInputs(),p=i.ask(target,true);
 const hand={wrist:{x:0,y:0,z:0},indexProximal:{x:.02,y:0,z:-.08},middleProximal:{x:0,y:0,z:-.085},indexTip:{x:.02,y:-.03,z:-.075},middleTip:{x:0,y:-.035,z:-.08},thumbProximal:{x:.045,y:0,z:-.045},thumbTip:{x:.05,y:.07,z:-.045}};
 for(let t=0;t<1;t+=.05)i.feedImmersive(null,null,hand,null,t);
 assert.equal(await p,'yes');
});
