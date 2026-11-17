import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkShardCoverage, preflightSteps } from '../../scripts/preflight.mjs';
import { assertExact, balance, casesFromReport } from '../../scripts/e2e-shards.mjs';
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const actual = readdirSync(new URL('../e2e/', import.meta.url)).filter(n => n.endsWith('.spec.ts')).map(n => `tests/e2e/${n}`);
const path = actual[0];
test('current CI roster contains every spec and invokes the audited ten-shard plan', () => {
  assert.equal(checkShardCoverage(workflow, actual), actual.length);
});
test('new unregistered spec fails before publishing', () => {
  assert.throws(() => checkShardCoverage(workflow, [...actual, 'tests/e2e/new.spec.ts']), /coverage list: missing/);
});
test('deleted spec leaves a stale roster entry and fails', () => {
  assert.throws(() => checkShardCoverage(workflow, actual.filter(p => p !== path)), /stale or unknown/);
});
test('duplicate or missing matrix numbers fail closed', () => {
  assert.throws(() => checkShardCoverage(workflow.replace('8, 9, 10', '8, 9, 9'), actual), /Unsupported shard plan/);
  assert.throws(() => checkShardCoverage(workflow.replace(', 10]', ']'), actual), /Unsupported shard plan/);
});
test('duplicate roster entry fails', () => {
  assert.throws(() => checkShardCoverage(workflow.replace('          diff actual.txt', `            ${path}\n          diff actual.txt`), actual), /coverage list: duplicate/);
});
test('changed matrix syntax or unaudited execution fails closed', () => {
  assert.throws(() => checkShardCoverage(workflow.replace('      matrix:', '      changed:'), actual), /Cannot read CI shard/);
  assert.throws(() => checkShardCoverage(workflow.replace('node scripts/e2e-shards.mjs plan 10', 'echo skip'), actual), /Unsupported shard plan/);
});
test('CRLF workflow is accepted', () => {
  assert.equal(checkShardCoverage(workflow.replace(/\n/g, '\r\n'), actual), actual.length);
});
test('full preflight retains fresh install, typecheck, units, build and full E2E', () => {
  assert.deepEqual(preflightSteps(), [
    ['npm', ['ci']], ['npm', ['run', 'typecheck']],
    ['node', ['--test', 'tests/unit/*.test.mjs']],
    ['npm', ['run', 'build']], ['npm', ['run', 'test:e2e']],
  ]);
  assert.deepEqual(preflightSteps(true), []);
});
test('case audit rejects missing, extra and duplicate selections', () => {
  assertExact(['a', 'b'], ['b', 'a']);
  assert.throws(() => assertExact(['a', 'b'], ['a']), /Coverage mismatch/);
  assert.throws(() => assertExact(['a'], ['a', 'b']), /Coverage mismatch/);
  assert.throws(() => assertExact(['a', 'b'], ['a', 'a']), /Duplicate shard/);
  assert.throws(() => assertExact(['a', 'a'], ['a']), /Duplicate inventory/);
});
test('duration-weighted scheduling is deterministic and covers every case once', () => {
  const cases = ['a', 'b', 'c', 'd'].map(key => ({ key, titlePath: [key] }));
  const plan = balance(cases, { a: 80, b: 60, c: 40, d: 20 }, 2);
  assert.deepEqual(plan.map(s => s.estimatedMs), [100, 100]);
  assertExact(cases.map(c => c.key), plan.flatMap(s => s.cases.map(c => c.key)));
  assert.deepEqual(balance([...cases].reverse(), { a: 80, b: 60, c: 40, d: 20 }, 2), plan);
  assert.throws(() => balance(cases, { a: -1 }, 2), /Invalid duration/);
  assert.throws(() => balance(cases, {}, 5), /Invalid shard count/);
});
test('inventory preserves nested/parameterized titles and separates projects', () => {
  const report = { suites: [{ title: 'x.spec.ts', file: 'x.spec.ts', suites: [{ title: 'group', specs: [{ title: 'case -> works', id: 'x', file: 'x.spec.ts', tests: [{ projectName: 'chromium', results: [{ duration: 15 }] }, { projectName: 'webkit', results: [] }] }] }] }] };
  const cases = casesFromReport(report);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases[0].titlePath, ['group', 'case -> works']);
  assert.equal(cases[0].selector, '[chromium] › x.spec.ts › group › case -> works');
  assert.notEqual(cases[0].key, cases[1].key);
  assert.equal(cases[0].durationMs, 15);
  report.suites[0].suites[0].specs[0].title = 'unsupported › delimiter';
  assert.throws(() => casesFromReport(report), /Unsupported test-list delimiter/);
});
test('inventory fails closed on empty and collection error reports', () => {
  assert.throws(() => casesFromReport({ suites: [] }), /No E2E cases/);
  assert.throws(() => casesFromReport({ suites: [], errors: ['bad import'] }), /bad import/);
});
