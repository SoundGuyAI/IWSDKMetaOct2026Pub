import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,pressWindows} from '../../scripts/perf/button-frame-probe.mjs';
test('performance summary preserves samples, reports nearest-rank percentiles and empty data honestly',()=>{
 const values=[5,1,4,2,3];assert.deepEqual(summarize(values),{count:5,median:3,p95:5,max:5});assert.deepEqual(values,[5,1,4,2,3]);
 assert.deepEqual(summarize([]),{count:0,median:null,p95:null,max:null});
});
test('press windows use explicit post-press timestamps, never pretend missing frames were fast',()=>{
 const frames=[{t:99,ms:100},{t:100,ms:16},{t:399,ms:33},{t:400,ms:80}];
 assert.deepEqual(pressWindows(frames,[100,900]),[{t:100,count:2,median:16,p95:33,max:33},{t:900,count:0,median:null,p95:null,max:null}]);
});