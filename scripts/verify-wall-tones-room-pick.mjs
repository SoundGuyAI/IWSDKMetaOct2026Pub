/** Verify room-scale wall-pick UI + early AR switch wiring. */
export default async function run({ page, frame }) {
  const surface = frame ?? page;
  await surface.evaluate(() => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
    sessionStorage.setItem('wall-tones-awaiting-mode', '1');
    sessionStorage.removeItem('wall-tones-setup-mode');
  });
  await surface.evaluate(() => {
    location.reload();
  });
  await page.waitForLoadState('networkidle');
  await surface.waitForFunction(() => window.__wallTonesDebug != null, null, {
    timeout: 90000,
  });
  await page.waitForTimeout(1500);

  const beforeFake = await surface.evaluate(() => ({
    title: document.title,
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    hand: sessionStorage.getItem('wall-tones-dominant-hand'),
  }));

  await surface.evaluate(() => {
    window.__wallTonesDebug?.startFakeWallPick();
  });
  await page.waitForTimeout(500);

  const afterFake = await surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    slotCandidateCount: window.__wallTonesDebug?.slotCandidateCount ?? 0,
    selectedSlotCount: window.__wallTonesDebug?.selectedSlotCount ?? 0,
  }));

  for (let i = 0; i < 4; i += 1) {
    await surface.evaluate((index) => {
      window.__wallTonesDebug?.selectSlot(index);
    }, i);
    await page.waitForTimeout(120);
  }

  const afterPick = await surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    selectedSlotCount: window.__wallTonesDebug?.selectedSlotCount ?? 0,
    gamePhase: window.__wallTonesDebug?.phase ?? null,
    padHint: document.title,
  }));

  const uiSource = await surface.evaluate(async () => {
    const res = await fetch('/ui/wall-tones-placeholder.uikitml');
    const text = await res.text();
    return {
      hasWallPickHint: text.includes('wall-pick-hint'),
      hasCyanHint: text.includes('Cyan = walls'),
    };
  });

  return {
    ok:
      afterFake.flowPhase === 'wall-picking' &&
      afterFake.slotCandidateCount === 4 &&
      afterPick.flowPhase === 'playing' &&
      uiSource.hasWallPickHint,
    beforeFake,
    afterFake,
    afterPick,
    uiSource,
  };
}
