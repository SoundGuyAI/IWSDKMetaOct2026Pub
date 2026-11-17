/** Trusted browser automation: charge Rift Lab and freeze a sealing frame. */
export default async function run({ page, frame }) {
  const candidates = [];
  if (frame) candidates.push(frame);
  for (const f of page.frames()) candidates.push(f);

  let target = null;
  let last = null;
  for (let attempt = 0; attempt < 20 && target == null; attempt++) {
    for (const f of candidates) {
      try {
        const info = await f.evaluate(() => ({
          hasDebug: typeof window.__riftLabDebug !== 'undefined',
          hasBuild: typeof window.__wallTonesBuildInfo !== 'undefined',
          hasCanvas: !!document.querySelector('canvas'),
          href: location.href,
        }));
        last = { ...info, url: f.url() };
        if (info.hasDebug || info.hasBuild || info.hasCanvas) {
          target = f;
          break;
        }
      } catch {
        // Cross-origin or detached frame.
      }
    }
    if (target == null) await page.waitForTimeout(500);
  }

  if (target == null) {
    return { ok: false, reason: 'no-app-frame', last, frameCount: page.frames().length };
  }

  for (let i = 0; i < 40; i++) {
    const ready = await target.evaluate(() => typeof window.__riftLabDebug !== 'undefined');
    if (ready) break;
    await page.waitForTimeout(250);
  }

  const result = await target.evaluate(() => {
    const d = window.__riftLabDebug;
    if (!d) {
      return {
        ok: false,
        reason: 'no-debug',
        href: location.href,
        hasBuild: typeof window.__wallTonesBuildInfo !== 'undefined',
        hasCanvas: !!document.querySelector('canvas'),
      };
    }
    d.enter();
    d.start();
    for (let i = 0; i < 16; i++) d.playNote(undefined, 'right');
    // One rift keeps the beam aimed at an on-camera target.
    d.spawnRift();
    d.previewSeal(0.55);
    return { ok: true, snapshot: d.snapshot() };
  });

  await page.waitForTimeout(700);
  return { ...result, frameUrl: target.url() };
}
