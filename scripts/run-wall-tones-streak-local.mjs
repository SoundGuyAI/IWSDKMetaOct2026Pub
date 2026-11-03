import { chromium } from 'playwright';
import run from './wall-tones-streak-10.mjs';

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-certificate-errors'],
});
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    console.error(`[browser ${msg.type()}]`, msg.text());
  }
});
await page.goto('https://localhost:8081/', {
  waitUntil: 'networkidle',
  timeout: 120000,
});
const frame =
  page.frames().find(
    (f) => f.url().includes('localhost:8081') && f !== page.mainFrame(),
  ) ?? page;
const result = await run({ page, frame });
console.log(JSON.stringify(result));
await browser.close();
process.exit(result.ok ? 0 : 1);
