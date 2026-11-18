import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/wall-tones/first-note-help.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {FirstNoteHelp,firstNoteColorClip,firstNoteHelpText,FIRST_NOTE_GUIDANCE}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('three first-note misses coach once; fourth arms following demonstrations until first note matched',()=>{
 const h=new FirstNoteHelp();assert.equal(h.needsColorCue(),false);
 assert.equal(h.wrong(0),false);assert.equal(h.wrong(0),false);assert.equal(h.wrong(0),true);assert.equal(h.needsColorCue(),false);
 assert.equal(h.wrong(0),false);assert.equal(h.needsColorCue(),true);assert.equal(h.wrong(0),false);assert.equal(h.needsColorCue(),true);
 h.correct(0);assert.equal(h.needsColorCue(),false);assert.equal(h.wrong(0),false);assert.equal(h.wrong(0),false);assert.equal(h.wrong(0),true);
});
test('later-note misses do not count; later-note success cannot clear first-note struggle',()=>{
 const h=new FirstNoteHelp();for(let i=0;i<7;i++)assert.equal(h.wrong(2),false);assert.equal(h.needsColorCue(),false);
 for(let i=0;i<4;i++)h.wrong(0);h.correct(3);assert.equal(h.needsColorCue(),true);
 assert.equal(new FirstNoteHelp().needsColorCue(),false);
});
test('cue uses actual four-pad palette with exact approved words, no fallback to blue',()=>{
 const constants=readFileSync(new URL('../../src/wall-tones/constants.ts',import.meta.url),'utf8');
 for(const [id,color]of ['green','red','blue','yellow'].entries()){
  assert.match(constants,new RegExp(`id: ${id}, name: '${color}'`));
  assert.equal(firstNoteColorClip(id),`press-${color}`);assert.equal(firstNoteHelpText(firstNoteColorClip(id)),`Press ${color}.`);
 }
 assert.equal(firstNoteColorClip(-1),undefined);assert.equal(firstNoteColorClip(4),undefined);
 assert.equal(firstNoteHelpText('guidance'),FIRST_NOTE_GUIDANCE);
});
test('runtime counts only input mismatches, clears only human first-note matches, preserves retries and instruction memory',()=>{
 const s=readFileSync(new URL('../../src/wall-tones/wall-tones-system.ts',import.meta.url),'utf8');
 const input=s.slice(s.indexOf('private handlePadInput'),s.indexOf('private finishCompletedPattern'));
 assert.ok(input.indexOf("this.game.phase !== 'input'")<input.indexOf('this.onWrongInput'));
 assert.ok(input.indexOf('this.firstNoteHelp.correct(this.game.inputStep)')>input.indexOf('if (padIndex !== expected)'));
 const wrong=s.slice(s.indexOf('private async onWrongInput'),s.indexOf('private renderGameOverSummary'));
 assert.match(wrong,/firstNoteHelp.wrong\(missStep\)/);assert.match(wrong,/speakFirstNoteHelp\('guidance', helpCast\)/);
 const playback=s.slice(s.indexOf('private async playSequence'),s.indexOf('private armAllPads'));
 assert.ok(playback.indexOf('await playPadTone(padId')<playback.indexOf('speakFirstNoteHelp(cue, helpCast)'));
 assert.ok(playback.indexOf('speakFirstNoteHelp(cue, helpCast)')<playback.indexOf("this.game.phase = 'input'"));
 assert.match(playback,/index === 0 && assistedFirstNote/);assert.match(playback,/helpNarrationMark === this.narrationInterrupt/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
 const memory=readFileSync(new URL('../../src/wall-tones/instruction-memory.ts',import.meta.url),'utf8');assert.doesNotMatch(memory,/firstNoteHelp|press-green|guidance/);
});
