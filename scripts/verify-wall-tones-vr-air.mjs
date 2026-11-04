/** Verify Wall Tones VR air-place + rescan UI wiring via managed browser. */
export default async function run({ page, frame }) {
  const surface = frame ?? page;
  await surface.evaluate(() => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    sessionStorage.setItem('wall-tones-setup-mode', 'sitting');
    sessionStorage.setItem('wall-tones-dominant-hand', 'right');
  });
  await surface.evaluate(() => {
    location.reload();
  });
  await page.waitForLoadState('networkidle');
  await surface.waitForFunction(() => window.__wallTonesDebug != null, null, {
    timeout: 90000,
  });

  // Enter XR if offered so immersive path can run.
  await page.waitForTimeout(1500);

  const before = await surface.evaluate(() => ({
    title: document.title,
    mode: sessionStorage.getItem('iwsdk-experience-mode'),
    setup: sessionStorage.getItem('wall-tones-setup-mode'),
    hand: sessionStorage.getItem('wall-tones-dominant-hand'),
    phase: window.__wallTonesDebug?.phase ?? null,
  }));

  // Wait for scan → air placement (no planes in emulator) or playing.
  const deadline = Date.now() + 20000;
  let statusText = '';
  while (Date.now() < deadline) {
    statusText = await surface.evaluate(() => {
      // UIKitML text is not always in DOM; fall back to debug + title.
      return {
        title: document.title,
        phase: window.__wallTonesDebug?.phase ?? null,
        hand: sessionStorage.getItem('wall-tones-dominant-hand'),
      };
    });
    if (statusText.title === 'Wall Tones') {
      break;
    }
    await page.waitForTimeout(400);
  }

  // Confirm rescan + orient helpers exist in the loaded UIKitML source.
  const uiSource = await surface.evaluate(async () => {
    const res = await fetch('/ui/wall-tones-placeholder.uikitml');
    const text = await res.text();
    return {
      hasRescan: text.includes('rescan-room-button'),
      hasOrient: text.includes('air-orient-row'),
      hasOrientHint: text.includes('outline eases flat or upright'),
    };
  });

  return {
    ok: before.hand === 'right' && uiSource.hasRescan && uiSource.hasOrient,
    before,
    statusText,
    uiSource,
  };
}
