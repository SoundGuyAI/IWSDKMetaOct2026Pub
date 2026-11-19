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
