import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const src = readFileSync(new URL('../../src/wall-tones/cypher-background.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { CYPHER_BACKGROUND, BackgroundProgress, BACKGROUND_PROGRESS_KEY } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const store = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };
test('all35 reviewed lines are ordered, unique, and complete', () => {
 assert.equal(CYPHER_BACKGROUND.length,35);
 assert.deepEqual(CYPHER_BACKGROUND.map(r=>r.id),Array.from({length:35},(_,i)=>'R'+String(i+1).padStart(2,'0')));
 for (const r of CYPHER_BACKGROUND) assert.ok(r.text.length > 20);
 assert.match(CYPHER_BACKGROUND[24].text,/Houston/);
 assert.match(CYPHER_BACKGROUND[30].text,/don't want revenge/);
});
test('proposed start afterAct1 cannot count early patterns or interrupt narrator', () => {
 const p=new BackgroundProgress(store());
 for(let i=0;i<20;i++) assert.equal(p.successfulPattern(false,true),undefined);
 assert.equal(p.successfulPattern(true,true),undefined);
 assert.equal(p.successfulPattern(true,false),undefined);
 assert.equal(p.successfulPattern(true,true).id,'R01');
 p.lineCompleted();
 assert.equal(p.successfulPattern(true,true),undefined);
 assert.equal(p.successfulPattern(true,true).id,'R02');
});
test('skip/reload retains unheard line; completion persists, exhausted story stops', () => {
 const s=store();let p=new BackgroundProgress(s);
 p.successfulPattern(true,true);p.successfulPattern(true,true);
 p=new BackgroundProgress(s);assert.equal(p.successfulPattern(true,true).id,'R01');
 for(let i=0;i<35;i++) {
  if(i>0) { assert.equal(p.successfulPattern(true,true),undefined);assert.equal(p.successfulPattern(true,true).id,CYPHER_BACKGROUND[i].id); }
  p.lineCompleted(); p=new BackgroundProgress(s);
 }
 assert.equal(p.completedLines,35);assert.equal(p.successfulPattern(true,true),undefined);
});
test('invalid/restricted saves fall back safely', () => {
 const s=store();s.setItem(BACKGROUND_PROGRESS_KEY,'broken');
 assert.equal(new BackgroundProgress(s).completedLines,0);
 const p=new BackgroundProgress({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}});
 assert.doesNotThrow(()=>p.successfulPattern(true,true));
 assert.equal(p.successfulPattern(true,true).id,'R01');
});
test('skip is not heard: next stays and same line replays at the next eligible boundary', () => {
 const s=store();const p=new BackgroundProgress(s);
 p.successfulPattern(true,true);
 assert.equal(p.successfulPattern(true,true).id,'R01');
 assert.equal(p.completedLines,0);
 assert.equal(p.successfulPattern(true,true).id,'R01');
 assert.equal(p.successfulPattern(true,false),undefined);
 assert.equal(p.completedLines,0);
 assert.equal(p.successfulPattern(true,true).id,'R01');
 assert.equal(new BackgroundProgress(s).successfulPattern(true,true).id,'R01');
 p.lineCompleted();
 assert.equal(p.completedLines,1);
});
