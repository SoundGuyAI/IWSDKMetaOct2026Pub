import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/wall-tones/return-reminders.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ReturnReminderSession,returnCypherLine,reminderTutorial,RETURN_VISIT_KEY}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('fresh game entry is not a return; reopening allows one welcome and each completed-context offer once',()=>{
 const s=store(),fresh=new ReturnReminderSession(s);assert.equal(fresh.takeWelcome(),false);assert.equal(fresh.takeOffer('store',true,true),false);
 const reopened=new ReturnReminderSession(s);assert.equal(reopened.takeWelcome(),true);assert.equal(reopened.takeWelcome(),false);
 assert.equal(reopened.takeOffer('store',true,false),false);assert.equal(reopened.takeOffer('store',true,true),true);assert.equal(reopened.takeOffer('store',true,true),false);assert.equal(reopened.takeOffer('achievements',true,true),true);
 assert.equal(new ReturnReminderSession(s).takeOffer('store',true,true),true);
});
test('Yes replays only; No/timeout are quiet and never clear stored heard/progress data',()=>{
 const s=store();s.setItem('wall-tones-instructions-v1','sentinel');const r=new ReturnReminderSession(s);assert.equal(r.shouldReplay('yes'),true);assert.equal(r.shouldReplay('no'),false);assert.equal(r.shouldReplay(null),false);assert.equal(s.getItem('wall-tones-instructions-v1'),'sentinel');s.removeItem(RETURN_VISIT_KEY);assert.equal(new ReturnReminderSession(s).returning,false);
});
test('blocked storage never invents a return and does not block the game',()=>{
 const r=new ReturnReminderSession({getItem(){throw Error();},setItem(){throw Error();}});assert.equal(r.returning,false);assert.equal(new ReturnReminderSession(undefined).returning,false);
});
test('stage lines use completed windows and actual encounter state, never current streak',()=>{
 const base={completedWindowIds:[],storyFinished:false};assert.equal(returnCypherLine(base),'C-R01');assert.equal(returnCypherLine({...base,completedWindowIds:['connection']}),'C-R02');assert.equal(returnCypherLine({...base,completedWindowIds:['connection','codename']}),'C-R03');assert.equal(returnCypherLine({...base,rifts:'active'}),'C-R04');assert.equal(returnCypherLine({...base,rifts:'sealed'}),'C-R05');assert.equal(returnCypherLine({...base,storyFinished:true}),'C-R06');assert.equal(returnCypherLine({...base,storyFinished:true,rifts:'active'}),'C-R04');
});
test('context picks its own instructions with no section chooser',()=>{
 assert.equal(reminderTutorial('gameplay','mr'),'howToPlayMr');assert.equal(reminderTutorial('store','phone'),'storeIntro');assert.equal(reminderTutorial('achievements','phone'),'achvIntroIphone');assert.equal(reminderTutorial('achievements','flat'),'achvIntroPc');
});

test('learning a context for the first time after reopening does not immediately add a reminder on the next same-session visit',()=>{
 const s=store();new ReturnReminderSession(s);const r=new ReturnReminderSession(s);assert.equal(r.takeOffer('store',false,true),false);assert.equal(r.takeOffer('store',true,true),false);assert.equal(new ReturnReminderSession(s).takeOffer('store',true,true),true);
});
