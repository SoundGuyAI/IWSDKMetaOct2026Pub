/** Leave the app in wall-picking with 4 visible debug slots. */
export default async function run({ page, frame }) {
  const surface = frame ?? page;
  await surface.waitForFunction(() => window.__wallTonesDebug != null, null, {
    timeout: 60000,
  });
  await surface.evaluate(() => {
    window.__wallTonesDebug?.startFakeWallPick();
  });
  await page.waitForTimeout(400);
  return surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    slotCandidateCount: window.__wallTonesDebug?.slotCandidateCount ?? 0,
  }));
}
