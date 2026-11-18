import { spawnSync } from 'node:child_process';
import path from 'node:path';

const npx = path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npx-cli.js');
const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [npx, '@iwsdk/cli', ...args], {
  encoding: 'utf8',
  cwd: process.cwd(),
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
