import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const js=ts.transpileModule(readFileSync(new URL('../../src/main-menu-layout.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const layout=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('only flat Quest browser labels Start as Flat',()=>{
 assert.equal(layout.startButtonLabel(true,'OculusBrowser Quest 3'),'Start Wall Tones (Flat)');
 assert.equal(layout.startButtonLabel(false,'OculusBrowser Quest 3'),'Start Wall Tones');
 assert.equal(layout.startButtonLabel(true,'iPhone Safari'),'Start Wall Tones');
 assert.equal(layout.startButtonLabel(true,'Chrome Windows'),'Start Wall Tones');
});

test('desktop row is frameless, stacked buttons restore, dialogs preserve return shape',()=>{
 const props=new Map();const panel={getElementById:id=>({setProperties:p=>props.set(id,{...props.get(id),...p})})};
 layout.applyMainMenuShape(panel,'row');assert.equal(props.get('main-menu-root').width,1180);assert.equal(props.get('main-menu-root').borderWidth,0);assert.equal(props.get('main-menu-buttons').flexDirection,'row');assert.equal(props.get('lab-entry-button').width,200);
 const revision=layout.mainMenuLayoutRevision();layout.applyMainMenuShape(panel,'dialog');assert.ok(layout.mainMenuLayoutRevision()>revision);assert.equal(layout.isMainMenuDialogOpen(),true);assert.equal(layout.currentMainMenuShape(),'row');assert.equal(props.get('main-menu-root').width,520);
 layout.applyMainMenuShape(panel,'stack');assert.equal(layout.isMainMenuDialogOpen(),false);assert.equal(props.get('main-menu-buttons').flexDirection,'column');assert.equal(props.get('lab-entry-button').width,undefined);assert.equal(props.get('main-menu-root').borderWidth,2);
});

test('secondary menu controls keep readable label and icon colors in every state',()=>{
 const props=new Map();const panel={getElementById:id=>({setProperties:p=>props.set(id,{...props.get(id),...p})})};
 for(const shape of ['row','dialog','stack']){
  layout.applyMainMenuShape(panel,shape);
  for(const id of ['xr-button','lab-entry-button','settings-button']){
   const p=props.get(id);assert.equal(p.color,'#eaf0ff');assert.equal(p.backgroundColor,'#243650');
   assert.equal(p.hover.color,p.color);assert.equal(p.hover.backgroundColor,'#354f73');
   assert.equal(p.active.color,p.color);assert.equal(p.active.backgroundColor,'#405e86');
  }
 }
 const markup=readFileSync(new URL('../../public/ui/main-menu.uikitml',import.meta.url),'utf8');
 for(const icon of ['RectangleGoggles','FlaskConical','Settings']) assert.ok(markup.includes('<ButtonIcon style="color: #eaf0ff"><'+icon+'>'));
});
