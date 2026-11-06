/** First run uses sparse praise through10; later records get every extension. */
export function shouldAnnounceRecord(streak: number, previousBest: number, firstRun: boolean): boolean {
  return streak > previousBest && (!firstRun || streak > 10 || streak % 3 === 0);
}
