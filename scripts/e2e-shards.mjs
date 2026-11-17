import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Identity uses project + file + complete title path, not line numbers, so adding
// a case does not discard the history for every case below it.
export function casesFromReport(report) {
  const cases = [];
  function visit(suite, parents = []) {
    const titles = suite.file === suite.title ? parents : [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const titlePath = [...titles, spec.title];
        const file = spec.file.replaceAll('\\', '/');
        const project = test.projectName;
        const key = JSON.stringify([project, file, ...titlePath]);
        if ([project, file, ...titlePath].some(s => /[\r\n›]/.test(s))) {
          throw new Error(`Unsupported test-list delimiter in ${key}`);
        }
        cases.push({ key, id: spec.id, file, project, titlePath,
          selector: `[${project}] › ${file} › ${titlePath.join(' › ')}`,
          passed: test.status === 'expected',
          durationMs: (test.results ?? []).reduce((sum, result) => sum + result.duration, 0),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  }
  for (const suite of report.suites ?? []) visit(suite);
  if (report.errors?.length) throw new Error(JSON.stringify(report.errors));
  assertExact(cases.map(c => c.key), cases.map(c => c.key));
  if (!cases.length) throw new Error('No E2E cases collected');
  return cases;
}

export function assertExact(expected, actual) {
  if (new Set(expected).size !== expected.length) throw new Error('Duplicate inventory identity');
  if (new Set(actual).size !== actual.length) throw new Error('Duplicate shard selection');
  const want = new Set(expected), got = new Set(actual);
  const missing = expected.filter(key => !got.has(key));
  const extra = actual.filter(key => !want.has(key));
  if (missing.length || extra.length) throw new Error(`Coverage mismatch: missing ${missing.join(',')}; extra ${extra.join(',')}`);
}

export function balance(cases, history = {}, count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > cases.length) throw new Error('Invalid shard count');
  const shards = Array.from({ length: count }, (_, i) => ({ shard: i + 1, estimatedMs: 0, cases: [] }));
  const weighted = cases.map(test => {
    const measured = history[test.key];
    if (measured !== undefined && (!Number.isFinite(measured) || measured <= 0)) throw new Error(`Invalid duration for ${test.key}`);
    // Cold-start estimates only. CI reports replace these with measured costs.
    const fallback = test.titlePath.join(' ').includes('real mouse presses reach') ? 240_000 : 25_000;
    return { ...test, estimatedMs: measured ?? fallback, measured: measured !== undefined };
  }).sort((a, b) => b.estimatedMs - a.estimatedMs || a.key.localeCompare(b.key));
  for (const test of weighted) {
    const target = [...shards].sort((a, b) => a.estimatedMs - b.estimatedMs || a.shard - b.shard)[0];
    target.cases.push(test);
    target.estimatedMs += test.estimatedMs;
  }
  assertExact(cases.map(c => c.key), shards.flatMap(s => s.cases.map(c => c.key)));
  return shards;
}

function collect(output, extra = []) {
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json', ...extra], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(output) },
  });
  if (result.status !== 0) throw new Error(`Playwright collection failed (${result.status})`);
  return casesFromReport(JSON.parse(readFileSync(output, 'utf8')));
}

export function main(args = process.argv.slice(2)) {
  const mode = args[0];
  mkdirSync('.tmp/e2e-shards', { recursive: true });
  if (mode === 'history') {
    const history = {};
    for (const path of args.slice(1)) for (const test of casesFromReport(JSON.parse(readFileSync(path, 'utf8')))) {
      if (test.passed && test.durationMs > 0) history[test.key] = Math.max(history[test.key] ?? 0, test.durationMs);
    }
    writeFileSync('test-results/e2e-durations.json', JSON.stringify(history, null, 2) + '\n');
    return;
  }
  if (mode !== 'plan') throw new Error('Usage: node scripts/e2e-shards.mjs plan [count] | history report.json...');
  const count = Number(args[1] ?? 10);
  const inventory = collect('.tmp/e2e-shards/inventory.json');
  const history = JSON.parse(readFileSync('scripts/e2e-durations.json', 'utf8'));
  const shards = balance(inventory, history, count);
  // Recollect every actual selector. This detects title-prefix ambiguity,
  // unsupported selector syntax, omitted cases and duplicates before execution.
  const selected = [];
  for (const shard of shards) {
    const path = `.tmp/e2e-shards/${shard.shard}.txt`;
    writeFileSync(path, shard.cases.map(test => test.selector).join('\n') + '\n');
    const actual = collect(`.tmp/e2e-shards/${shard.shard}.inventory.json`, ['--test-list', path]);
    assertExact(shard.cases.map(c => c.key), actual.map(c => c.key));
    selected.push(...actual.map(c => c.key));
    console.log(`Shard ${shard.shard}: ${actual.length} cases, estimated ${(shard.estimatedMs / 60000).toFixed(2)} min test time`);
  }
  assertExact(inventory.map(c => c.key), selected);
  writeFileSync('.tmp/e2e-shards/plan.json', JSON.stringify({ count: inventory.length, measured: shards.flatMap(s => s.cases).filter(c => c.measured).length, shards }, null, 2) + '\n');
  console.log(`Exact coverage passed: ${inventory.length} cases selected once across ${count} shards. Estimates exclude setup and are not a runtime promise.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
