export default async function run({ page, frame }) {
  const surface = frame ?? page;
  return surface.evaluate(() => ({
    flowPhase: window.__wallTonesDebug?.flowPhase ?? null,
    slotCandidateCount: window.__wallTonesDebug?.slotCandidateCount ?? 0,
    selectedSlotCount: window.__wallTonesDebug?.selectedSlotCount ?? 0,
    gamePhase: window.__wallTonesDebug?.phase ?? null,
  }));
}
