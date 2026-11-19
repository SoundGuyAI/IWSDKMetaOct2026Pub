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
test('background story does not count early patterns or interrupt narrator', () => {
 const p=new BackgroundProgress(store());
 for(let s=0;s<8;s++) assert.equal(p.successfulPattern(s,true),undefined); // below the start streak nothing counts
 assert.equal(p.successfulPattern(9,true),undefined);
 assert.equal(p.successfulPattern(9,false),undefined);
 assert.equal(p.successfulPattern(9,true).id,'R01');
 p.lineCompleted();
 assert.equal(p.successfulPattern(9,true),undefined);
 assert.equal(p.successfulPattern(9,true).id,'R02');
});
test('unstarted/reloaded line remains pending; started progress persists, exhausted story stops', () => {
 const s=store();let p=new BackgroundProgress(s);
 p.successfulPattern(9,true);p.successfulPattern(9,true);
 p=new BackgroundProgress(s);assert.equal(p.successfulPattern(9,true).id,'R01');
 for(let i=0;i<35;i++) {
  if(i>0) { assert.equal(p.successfulPattern(9,true),undefined);assert.equal(p.successfulPattern(9,true).id,CYPHER_BACKGROUND[i].id); }
  p.lineCompleted(); p=new BackgroundProgress(s);
 }
 assert.equal(p.completedLines,35);assert.equal(p.successfulPattern(9,true),undefined);
});
test('invalid/restricted saves fall back safely', () => {
 const s=store();s.setItem(BACKGROUND_PROGRESS_KEY,'broken');
 assert.equal(new BackgroundProgress(s).completedLines,0);
 const p=new BackgroundProgress({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}});
 assert.doesNotThrow(()=>p.successfulPattern(9,true));
 assert.equal(p.successfulPattern(9,true).id,'R01');
});
test('before playback starts, next stays and the unheard line remains pending', () => {
 const s=store();const p=new BackgroundProgress(s);
 p.successfulPattern(9,true);
 assert.equal(p.successfulPattern(9,true).id,'R01');
 assert.equal(p.completedLines,0);
 assert.equal(p.successfulPattern(9,true).id,'R01');
 assert.equal(p.successfulPattern(9,false),undefined);
 assert.equal(p.completedLines,0);
 assert.equal(p.successfulPattern(9,true).id,'R01');
 assert.equal(new BackgroundProgress(s).successfulPattern(9,true).id,'R01');
 p.lineCompleted();
 assert.equal(p.completedLines,1);
});

test('pacing: starts at streak 8, every two successes below 10, every pattern from 10, independent of Act 1', () => {
 const p=new BackgroundProgress(store());
 assert.equal(p.successfulPattern(7,true),undefined); // not counted
 assert.equal(p.successfulPattern(8,true),undefined); // first counted success
 assert.equal(p.successfulPattern(9,true).id,'R01'); // second success below 10
 p.lineCompleted();
 assert.equal(p.successfulPattern(9,true),undefined); // below 10: two needed again
 assert.equal(p.successfulPattern(9,true).id,'R02');
 p.lineCompleted();
 assert.equal(p.successfulPattern(11,true).id,'R03'); // at 10 and above every pattern
 p.lineCompleted();
 assert.equal(p.successfulPattern(12,true).id,'R04');
 p.lineCompleted();
 assert.equal(p.successfulPattern(13,true).id,'R05');
});
test('pacing: a counted success carries into the every-pattern range; a busy narrator defers without losing the turn', () => {
 const p=new BackgroundProgress(store());
 assert.equal(p.successfulPattern(9,true),undefined); // one success counted below 10
 assert.equal(p.successfulPattern(11,true).id,'R01'); // from 10 on a single success is enough
 p.lineCompleted();
 assert.equal(p.successfulPattern(11,false),undefined); // narrator busy: nothing plays
 assert.equal(p.successfulPattern(11,true).id,'R02');
});
test('pacing constants: start streak 8, every-pattern streak 10', async () => {
 const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
 assert.equal(m.BACKGROUND_START_STREAK,8);
 assert.equal(m.BACKGROUND_EVERY_PATTERN_STREAK,10);
});
