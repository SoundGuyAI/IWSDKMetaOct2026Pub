export default async function run({ page, frame }) {
  const surface = frame ?? page;
  for (let i = 0; i < 4; i += 1) {
    await surface.evaluate((index) => {
      window.__wallTonesDebug?.selectSlot(index);
    }, i);
    await page.waitForTimeout(80);
  }
  return surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    selectedSlotCount: window.__wallTonesDebug?.selectedSlotCount ?? 0,
    gamePhase: window.__wallTonesDebug?.phase ?? null,
  }));
}
