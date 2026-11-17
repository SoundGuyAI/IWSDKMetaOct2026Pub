import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const npx = path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npx-cli.js');
const r = spawnSync(
  process.execPath,
  [npx, '@iwsdk/cli', 'browser', 'logs', '--input-json', JSON.stringify({ count: 150 })],
  { encoding: 'utf8', cwd: process.cwd() },
);
fs.writeFileSync('artifacts/browser-logs.json', r.stdout);
const parsed = JSON.parse(r.stdout);
const logs = parsed?.data?.result ?? [];
const interesting = logs.filter((l) =>
  /error|warn|rift-lab|seal visual|TypeError|failed/i.test(`${l.level} ${l.message}`),
);
console.log(
  JSON.stringify(
    interesting.slice(-40).map((l) => ({
      level: l.level,
      message: String(l.message).slice(0, 240),
    })),
    null,
    2,
  ),
);
