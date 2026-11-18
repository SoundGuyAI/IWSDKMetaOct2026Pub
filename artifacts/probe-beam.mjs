export default async function run({ page, frame }) {
  const frames = [frame, ...page.frames()].filter(Boolean);
  let target = frames[0];
  for (const f of frames) {
    try {
      if (await f.evaluate(() => !!window.__riftLabDebug)) {
        target = f;
        break;
      }
    } catch {}
  }
  return target.evaluate(() => {
    const d = window.__riftLabDebug;
    d?.enter();
    d?.start();
    for (let i = 0; i < 12; i++) d?.playNote(undefined, 'right');
    d?.spawnRift();
    d?.previewSeal(0.55);
    // Walk the three.js scene via the canvas renderer if exposed.
    const canvas = document.querySelector('canvas');
    const keys = Object.keys(window).filter((k) => /three|scene|iwsdk|world/i.test(k));
    return {
      snapshot: d?.snapshot(),
      canvas: !!canvas,
      windowKeys: keys.slice(0, 30),
    };
  });
}
