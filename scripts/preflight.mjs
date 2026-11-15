import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read CI's existing lists, rather than maintaining a third shard manifest.
// Fail closed if the workflow format changes, so local coverage cannot go green
// after silently failing to understand the workflow.
export function checkShardCoverage(workflow, actual) {
  const matrix = workflow.match(/^      matrix:\r?\n        include:\r?\n([\s\S]*?)(?=^    name:)/m);
  const coverage = workflow.match(/^  e2e-coverage:\r?\n([\s\S]*?)(?=^  [a-z][\w-]*:|(?![\s\S]))/m);
  if (!matrix || !coverage) throw new Error('Cannot read CI shard matrix or coverage job; update preflight for the new workflow format.');
  const rows = [...matrix[1].matchAll(/^            files: (.+)$/gm)];
  if (!rows.length) throw new Error('CI shard matrix has no literal files rows.');
  const assigned = rows.flatMap(row => row[1].trim().split(/\s+/));
  if (assigned.some(path => !/^tests\/e2e\/[\w.-]+\.spec\.ts$/.test(path))) {
    throw new Error('Unsupported shard files syntax; expected literal tests/e2e/*.spec.ts paths.');
  }
  const listed = [...coverage[1].matchAll(/^\s+(tests\/e2e\/[\w.-]+\.spec\.ts)\s*\\?\s*$/gm)].map(row => row[1]);
  if (!listed.length) throw new Error('Cannot read CI coverage list; update preflight for the new workflow format.');
  const expected = new Set(actual);
  if (!expected.size) throw new Error('No local E2E spec files found.');
  const errors = [];
  for (const [label, paths] of [['matrix', assigned], ['coverage list', listed]]) {
    const seen = new Set();
    for (const path of paths) {
      if (seen.has(path)) errors.push(`${label}: duplicate ${path}`);
      seen.add(path);
      if (!expected.has(path)) errors.push(`${label}: stale or unknown ${path}`);
    }
    for (const path of expected) if (!seen.has(path)) errors.push(`${label}: missing ${path}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return expected.size;
}

export function preflightSteps(coverageOnly = false) {
  return coverageOnly ? [] : [
    ['npm', ['ci']],
    ['npm', ['run', 'typecheck']],
    ['node', ['--test', 'tests/unit/*.test.mjs']],
    ['npm', ['run', 'build']],
    // CI's initial/main/merge-ready runs include slow tests. Do not weaken it
    // to test:e2e:ci or reuse a possibly stale local preview server.
    ['npm', ['run', 'test:e2e']],
  ];
}

export function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--coverage-only')) throw new Error('Usage: node scripts/preflight.mjs [--coverage-only]');
  const actual = readdirSync('tests/e2e').filter(name => name.endsWith('.spec.ts')).map(name => `tests/e2e/${name}`);
  const count = checkShardCoverage(readFileSync('.github/workflows/ci.yml', 'utf8'), actual);
  console.log(`Shard coverage passed: ${count} specs in both CI lists.`);
  for (const [command, argv] of preflightSteps(args.includes('--coverage-only'))) {
    console.log(`\n> ${command} ${argv.join(' ')}`);
    // Node 22 supports glob expansion for --test; use explicit file arguments
    // too, keeping this shell-free and portable.
    const expanded = argv.flatMap(arg => arg === 'tests/unit/*.test.mjs'
      ? readdirSync('tests/unit').filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/unit/${name}`)
      : [arg]);
    const result = spawnSync(process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command, expanded, {
      stdio: 'inherit', env: { ...process.env, CI: '1' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  console.log('Preflight passed. Publish the complete tested tree, not partial file edits.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
