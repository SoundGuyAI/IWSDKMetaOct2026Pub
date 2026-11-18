import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/wall-tones/instruction-memory.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {InstructionMemory,INSTRUCTION_MEMORY_KEY,instructionSection}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('instruction memory persists only known tutorials, by platform clip, never story or current-state feedback',()=>{
 const s=store(),a=new InstructionMemory(s);a.completed('howToPlay');a.completed('C15');a.completed('wrong1');a.completed('lookAround');
 const b=new InstructionMemory(s);assert.equal(b.hasHeard('howToPlay'),true);assert.equal(b.hasHeard('howToPlayMr'),false);assert.equal(b.hasHeard('C15'),false);assert.equal(b.hasHeard('wrong1'),false);assert.equal(instructionSection('lookAround'),undefined);
});
test('section reset and full reset retain unrelated sections then erase all instruction memory',()=>{
 const s=store(),a=new InstructionMemory(s);for(const id of ['howToPlay','storeIntro','achvIntroMr'])a.completed(id);
 a.resetSection('store');const b=new InstructionMemory(s);assert.equal(b.hasHeard('storeIntro'),false);assert.equal(b.hasHeard('howToPlay'),true);assert.equal(b.hasHeard('achvIntroMr'),true);b.reset();assert.equal(new InstructionMemory(s).hasHeard('howToPlay'),false);
});
test('invalid and blocked storage never stops play; unknown saved IDs are discarded',()=>{
 const s=store();s.setItem(INSTRUCTION_MEMORY_KEY,JSON.stringify({version:1,heard:['C15','howToPlay',null]}));const a=new InstructionMemory(s);assert.equal(a.hasHeard('C15'),false);assert.equal(a.hasHeard('howToPlay'),true);
 s.setItem(INSTRUCTION_MEMORY_KEY,'bad');assert.doesNotThrow(()=>new InstructionMemory(s));const b=new InstructionMemory({getItem(){throw Error();},setItem(){throw Error();}});b.completed('storeIntro');assert.equal(b.hasHeard('storeIntro'),true);
});
test('Reset All Data clears the new instruction key and the old achievements intro key',()=>{
 const economy=readFileSync(new URL('../../src/wall-tones/economy.ts',import.meta.url),'utf8');const reset=economy.slice(economy.indexOf('export function resetWallTonesStats'),economy.indexOf('export class WallTonesEconomy'));
 assert.ok(reset.includes(INSTRUCTION_MEMORY_KEY));assert.ok(reset.includes('wall-tones-achievements-intro-played'));assert.match(reset,/removeItem\(key\)/);
});

test('full and split how-to recordings share heard words but preserve the MR-specific start gesture',()=>{
 const s=store(),m=new InstructionMemory(s);m.completed('howToPlay');assert.equal(m.hasHeard('howToPlayRest'),true);assert.equal(m.hasHeard('pointAndPress'),true);assert.equal(m.hasHeard('howToPlayMr'),false);assert.equal(m.hasHeard('pointAndPressMr'),false);
 const n=new InstructionMemory(store());n.completed('howToPlayRest');assert.equal(n.hasHeard('howToPlay'),false);n.completed('pointAndPress');assert.equal(n.hasHeard('howToPlay'),true);assert.equal(n.hasHeard('howToPlayMr'),false);
});


test('opening transition has its own completion memory and does not reteach completed tutorials',()=>{
 const s=store(),m=new InstructionMemory(s);assert.equal(m.hasHeard('openingPattern'),false);
 m.completed('openingPattern');assert.equal(new InstructionMemory(s).hasHeard('openingPattern'),true);
 assert.equal(m.hasHeard('howToPlayRest'),false);
 m.reset();assert.equal(m.hasHeard('openingPattern'),false);
 for(const id of ['howToPlay','howToPlayMr','howToPlayRest']){
  const n=new InstructionMemory(store());n.completed(id);assert.equal(n.hasHeard('openingPattern'),true);
 }
});

test('transition runs after fanfare, after platform start direction, before unchanged Listen/repeat, with Skip guards',()=>{
 const s=readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts',import.meta.url),'utf8');
 const intro=s.slice(s.indexOf('private beginRoundWithIntro'),s.indexOf('private async playSequence'));
 assert.ok(intro.indexOf('playSimonStartupFanfare()')<intro.indexOf("speakAsync('openingPattern')"));
 assert.ok(intro.indexOf("? 'pointAndPressMr' : 'pointAndPress'")<intro.indexOf("speakAsync('openingPattern')"));
 assert.ok(intro.indexOf("speakAsync('openingPattern')")<intro.indexOf("speakAsync('howToPlayRest')"));
 assert.equal((intro.match(/narrMark === this.narrationInterrupt/g)||[]).length,3);
});
