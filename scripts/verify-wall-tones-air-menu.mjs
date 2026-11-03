/** Verify Air place menu button exists and pending air setup starts air-placement. */
export default async function run({ page, frame }) {
  const surface = frame ?? page;

  const uiSource = await surface.evaluate(async () => {
    const res = await fetch('/ui/wall-tones-placeholder.uikitml');
    const text = await res.text();
    return {
      hasAirButton: text.includes('mode-air-place-button'),
      hasAirLabel: text.includes('Air place'),
      hasRoom: text.includes('mode-room-scale-button'),
      hasSitting: text.includes('mode-sitting-button'),
    };
  });

  await surface.evaluate(() => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    sessionStorage.setItem('wall-tones-setup-mode', 'air');
    sessionStorage.removeItem('wall-tones-awaiting-mode');
  });
  await surface.evaluate(() => {
    location.reload();
  });
  await page.waitForLoadState('networkidle');
  await surface.waitForFunction(() => window.__wallTonesDebug != null, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  const after = await surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    title: document.title,
  }));

  return {
    ok:
      uiSource.hasAirButton &&
      uiSource.hasAirLabel &&
      uiSource.hasRoom &&
      uiSource.hasSitting &&
      after.flowPhase === 'air-placement',
    uiSource,
    after,
  };
}
