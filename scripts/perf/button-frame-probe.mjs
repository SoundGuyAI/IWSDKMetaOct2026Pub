/** Opt-in local investigation. Does not change game code or saved site data.
 * npm run build && node scripts/perf/button-frame-probe.mjs [output-directory]
 * Requires Playwright Chromium: npx playwright install chromium.
 * Software rendering is deliberately labelled, never presented as Quest FPS.
 */
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarize(values) {
  if (!values.length) return { count: 0, median: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { count: sorted.length, median: q(.5), p95: q(.95), max: sorted.at(-1) };
}
export function pressWindows(frames, presses, windowMs = 300) {
  return presses.map(t => ({ t, ...summarize(frames.filter(f => f.t >= t && f.t < t + windowMs).map(f => f.ms)) }));
}

async function run(out) {
  await mkdir(out, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), 'walltones-perf-'));
  // Direct child, not npm's detached server grandchild. Always collected below.
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4179', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', b => { serverLog += b; }); server.stderr.on('data', b => { serverLog += b; });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
      window.__buttonPerf = { writes: [], frames: [], presses: [], canvasEncodes: [] };
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { const t = performance.now(); const r = set.call(this, key, value); window.__buttonPerf.writes.push({ t, key, ms: performance.now() - t }); return r; };
      const encode = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args) { const t=performance.now(); const result=encode.apply(this,args); window.__buttonPerf.canvasEncodes.push({t,ms:performance.now()-t,width:this.width,height:this.height,stack:new Error().stack}); return result; };
      let last = 0;
      const frame = t => { if(last)window.__buttonPerf.frames.push({t,ms:t-last}); last=t; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      addEventListener('pointerdown', () => window.__buttonPerf.presses.push(performance.now()), true);
    });
    for (let attempt = 0; ; attempt++) {
      try { await page.goto('https://localhost:4179', {timeout: 10000}); break; }
      catch (error) { if (attempt >= 19 || server.exitCode != null) throw error; await new Promise(r=>setTimeout(r,250)); }
    }
    await page.waitForFunction(() => window.__wallTonesDebug?.flatAwaitingStart === true, {timeout:60000});
    const pads = [[335,251],[548,251],[335,464],[548,464]];
    const snap = () => page.evaluate(() => { const d=window.__wallTonesDebug; return { phase:d.phase, start:d.flatAwaitingStart, sequence:[...d.sequence], step:d.inputStep, streak:d.streak, bars:d.bars, presses:d.presses }; });
    const click = async index => { const [x,y]=pads[index]; await page.mouse.move(x-20,y-6,{steps:4}); await page.mouse.move(x,y,{steps:4}); await page.waitForTimeout(500); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up(); };
    // Startup has narration and pointer hover readiness; keep every startup attempt.
    const startup=[];
    for(let i=0;i<3;i++){ await click(0);startup.push(await snap()); if(!startup.at(-1).start)break; }
    const ready=async()=>{
      const deadline=Date.now()+60000;
      while(Date.now()<deadline){const s=await snap();if(s.phase==='input')return s;
        // Setup only: skip narration through the existing control action. Never submit a pad via debug.
        await page.evaluate(()=>{if(window.__wallTonesDebug.speechBusy)window.__wallTonesDebug.skipSpeech();});
        await page.waitForTimeout(250);
      } throw new Error('No input phase within 60 seconds');
    };
    const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    await ready(); const idleStart=await page.evaluate(()=>performance.now()); await page.waitForTimeout(3000); const idleEnd=await page.evaluate(()=>performance.now());
    const accepted=[];
    for(let i=0;i<12;i++){
      const before=await ready();const target=before.sequence[before.step];await click(target);
      await page.waitForFunction(({step,streak,presses})=>{const d=window.__wallTonesDebug;return d.inputStep!==step||d.streak!==streak||d.presses!==presses;},before,{timeout:10000});
      const after=await snap();accepted.push({before,after,target});await page.waitForTimeout(650);
    }
    const {profile}=await cdp.send('Profiler.stop');await writeFile(join(out,'game.cpuprofile'),JSON.stringify(profile));
    const game=await page.evaluate(()=>window.__buttonPerf);game.startup=startup;game.accepted=accepted;game.final=await snap();
    game.idle={start:idleStart,end:idleEnd,summary:summarize(game.frames.filter(f=>f.t>=idleStart&&f.t<idleEnd).map(f=>f.ms))};
    game.summary={canvasEncodes:summarize(game.canvasEncodes.map(c=>c.ms)),idle:game.idle.summary,frames:summarize(game.frames.map(f=>f.ms)),storage:summarize(game.writes.map(w=>w.ms)),pressWindows:pressWindows(game.frames,game.presses)};
    await writeFile(join(out,'game.json'),JSON.stringify(game,null,2));await page.screenshot({path:join(out,'real-input.png')});

    // Isolated real-source float microprobe. Core's Three exports are replaced
    // with the exact installed Three module solely to avoid booting another world.
    const source=await readFile('src/wall-tones/bar-floats.ts','utf8');
    await build({stdin:{contents:source.replace("'@iwsdk/core'","'three'"),resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',outfile:join(temp,'floats.mjs')});
    await build({stdin:{contents:"export {Scene,Vector3,PerspectiveCamera,WebGLRenderer} from 'three';",resolveDir:process.cwd()},bundle:true,format:'esm',outfile:join(temp,'three.mjs')});
    const isolated=await browser.newPage();await isolated.goto('about:blank');
    const floats=await readFile(join(temp,'floats.mjs'),'utf8'),three=await readFile(join(temp,'three.mjs'),'utf8');
    const micro=await isolated.evaluate(async({floats,three})=>{
      const load=s=>import(URL.createObjectURL(new Blob([s],{type:'text/javascript'})));
      const {BarFloatPool}=await load(floats);const T=await load(three);
      const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(640,480);document.body.append(renderer.domElement);
      const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,4/3,.01,20);camera.position.z=2;
      const pool=new BarFloatPool(),from=new T.Vector3(),to=new T.Vector3(.5,.5,0);let compileCallbacks=0;
      const one=()=>{const t=performance.now();pool.spawn(from,to,1,scene);const spawnMs=performance.now()-t;pool.update(.016,camera,false);
        const slot=pool.slots[0];slot.material.onBeforeCompile=()=>compileCallbacks++;
        const r=performance.now();renderer.render(scene,camera);return {spawnMs,renderSubmitMs:performance.now()-r,materialVersion:slot.material.version,programs:renderer.info.programs.length};};
      const cold=one();pool.clear();const warm=[];for(let i=0;i<100;i++){warm.push(one());pool.clear();}
      const reuse={slots:pool.slots.length,textures:pool.textureCache.size,materialVersion:pool.slots[0].material.version};
      pool.clear(); for(let i=0;i<20;i++)pool.spawn(from,to,1,scene);
      const burst={slots:pool.slots.length,textures:pool.textureCache.size,active:pool.slots.filter(s=>s.active).length};
      pool.spawn(from,to,2,scene); const newLabel={slots:pool.slots.length,textures:pool.textureCache.size};
      const result={cold,warm,compileCallbacks,reuse,burst,newLabel,mode:'headless Chromium / SwiftShader; CPU submission durations, not GPU completion or Quest FPS'};
      pool.dispose(scene);renderer.dispose();return result;
    },{floats,three});
    micro.summary={warmSpawn:summarize(micro.warm.map(s=>s.spawnMs)),warmRenderSubmit:summarize(micro.warm.map(s=>s.renderSubmitMs))};
    await writeFile(join(out,'floats.json'),JSON.stringify(micro,null,2));
    await writeFile(join(out,'environment.json'),JSON.stringify({browser:browser.version(),node:process.version,mode:'headless SwiftShader',source:'current checkout; build before running',timestamp:new Date().toISOString()},null,2));
    console.log(JSON.stringify({game:game.summary,final:game.final,micro:{cold:micro.cold,compileCallbacks:micro.compileCallbacks,reuse:micro.reuse,burst:micro.burst,newLabel:micro.newLabel,summary:micro.summary}},null,2));
  } finally {
    await browser?.close();
    if(server.exitCode==null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
    await writeFile(join(out,'server.log'),serverLog);await rm(temp,{recursive:true,force:true});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(resolve(process.argv[2]??'artifacts/button-performance')).catch(error=>{console.error(error);process.exitCode=1;});
}