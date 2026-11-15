import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkShardCoverage, preflightSteps } from '../../scripts/preflight.mjs';
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const actual = readdirSync(new URL('../e2e/', import.meta.url)).filter(n => n.endsWith('.spec.ts')).map(n => `tests/e2e/${n}`);
const path = actual[0];
test('current CI matrix and coverage list contain every local spec', () => {
  assert.equal(checkShardCoverage(workflow, actual), actual.length);
});
test('new unassigned spec fails before publishing', () => {
  assert.throws(() => checkShardCoverage(workflow, [...actual, 'tests/e2e/new.spec.ts']), /matrix: missing.*\ncoverage list: missing/);
});
test('deleted spec leaves a stale assignment and fails', () => {
  assert.throws(() => checkShardCoverage(workflow, actual.filter(p => p !== path)), /stale or unknown/);
});
test('duplicate matrix assignment fails', () => {
  const changed = workflow.replace('        include:', `        include:\n          - shard: 99\n            files: ${path}`);
  assert.throws(() => checkShardCoverage(changed, actual), /matrix: duplicate/);
});
test('duplicate coverage assignment fails', () => {
  const changed = workflow.replace('          diff actual.txt', `            ${path}\n          diff actual.txt`);
  assert.throws(() => checkShardCoverage(changed, actual), /coverage list: duplicate/);
});
test('changed matrix syntax fails closed', () => {
  assert.throws(() => checkShardCoverage(workflow.replace('      matrix:', '      changed:'), actual), /Cannot read CI shard/);
});
test('dynamic files syntax fails closed', () => {
  assert.throws(() => checkShardCoverage(workflow.replace(/files: .+/, 'files: ${{ inputs.files }}'), actual), /Unsupported shard files syntax/);
});
test('CRLF workflow is accepted', () => {
  assert.equal(checkShardCoverage(workflow.replace(/\n/g, '\r\n'), actual), actual.length);
});
test('full preflight includes fresh install, typecheck, units, build and complete E2E', () => {
  assert.deepEqual(preflightSteps(), [
    ['npm', ['ci']], ['npm', ['run', 'typecheck']],
    ['node', ['--test', 'tests/unit/*.test.mjs']],
    ['npm', ['run', 'build']], ['npm', ['run', 'test:e2e']],
  ]);
  assert.deepEqual(preflightSteps(true), []);
});
