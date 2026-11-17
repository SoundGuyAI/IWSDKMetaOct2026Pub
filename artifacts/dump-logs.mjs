import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const npx = path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npx-cli.js');
const r = spawnSync(
  process.execPath,
  [npx, '@iwsdk/cli', 'browser', 'logs', '--input-json', JSON.stringify({ count: 100 })],
  { encoding: 'utf8', cwd: process.cwd() },
);
fs.writeFileSync('artifacts/browser-logs.json', r.stdout);
const hit = [...r.stdout.matchAll(/rift-lab[^\n"]{0,120}|panel missing|RiftLab|__riftLab/gi)].map((m) => m[0]);
console.log(JSON.stringify({ hits: hit.slice(0, 40), status: r.status }, null, 2));
