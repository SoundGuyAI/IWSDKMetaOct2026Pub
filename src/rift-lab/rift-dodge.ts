/**
 * Pure geometry for the Rift Lab panel dodge (no three.js), so it can be
 * unit-tested. The panel is "in the way" when a ray crosses it on the way to
 * a rift: an open-hand aim ray, the UI pointer ray, or the eye line.
 */
export type V3 = readonly [number, number, number];
export interface Ray {
  origin: V3;
  /** Direction; need not be normalized. */
  dir: V3;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface ScanOpts {
  eye: V3;
  panel: V3;
  targets: readonly V3[];
  aimRays: readonly Ray[];
  uiRays: readonly Ray[];
  blockDeg: number;
  lateralM: number;
  /** How far above a rift's center the eye line must stay visible. */
  riftTopM?: number;
}

/**
 * Highest height, at the panel's depth, of any blocking ray (eye line to a
 * rift's upper part, open-hand aim ray, or UI ray). null when nothing blocks.
 * The panel's bottom edge must sit above this to clear the line of sight.
 */
export function riftBlockingLineY(opts: ScanOpts): number | null {
  if (opts.targets.length === 0) return null;
  const top = opts.riftTopM ?? 0;
  const rays: { ray: Ray; eyeLine: boolean }[] = [
    ...opts.aimRays.map((ray) => ({ ray, eyeLine: false })),
    ...opts.uiRays.map((ray) => ({ ray, eyeLine: false })),
  ];
  for (const t of opts.targets) {
    rays.push({ ray: { origin: opts.eye, dir: sub(t, opts.eye) }, eyeLine: true });
  }
  let best: number | null = null;
  for (const { ray, eyeLine } of rays) {
    const d = norm(ray.dir);
    const toPanel = sub(opts.panel, ray.origin);
    const flatP: V3 = [toPanel[0], 0, toPanel[2]];
    const flatD: V3 = [d[0], 0, d[2]];
    if (len(flatP) < 1e-3 || len(flatD) < 1e-3) continue;
    const c = Math.max(-1, Math.min(1, dot(norm(flatP), norm(flatD))));
    if ((Math.acos(c) * 180) / Math.PI >= opts.blockDeg) continue;
    const panelAlong = dot(toPanel, d);
    for (const t of opts.targets) {
      const rel = sub(t, ray.origin);
      const along = dot(rel, d);
      if (along < 0.05 || along > 10) continue;
      // The rift must lie beyond the panel, or the panel is not blocking it.
      if (along < panelAlong - 0.1) continue;
      const closest: V3 = [
        ray.origin[0] + d[0] * along,
        ray.origin[1] + d[1] * along,
        ray.origin[2] + d[2] * along,
      ];
      if (len(sub(closest, t)) > opts.lateralM) continue;
      // Height of this line where it passes the panel (horizontal depth).
      let dir = d;
      if (eyeLine) dir = norm(sub([t[0], t[1] + top, t[2]], ray.origin));
      const fd: V3 = [dir[0], 0, dir[2]];
      const fl = len(fd);
      if (fl < 1e-3) continue;
      const flatAlong = dot(flatP, norm(fd));
      const y = ray.origin[1] + (dir[1] / fl) * flatAlong;
      if (best == null || y > best) best = y;
    }
  }
  return best;
}

export function riftPanelBlocked(opts: ScanOpts): boolean {
  return riftBlockingLineY(opts) !== null;
}
