/**
 * Store tree: a press that turned into a drag must not also select the tile
 * it ends on. pointer-events fires `click` on release whenever the press was
 * shorter than 300 ms, whatever the pointer moved in between, so a quick
 * pinch-drag that ends over a tile opened its detail card (seen on Quest,
 * 2026-11-14). The guard remembers how far the pointer got from where the
 * press started; the tile click handlers ignore the click when it was a drag.
 */

/** Largest distance from the press point (list px) that still counts as a tap. */
export const STORE_TAP_SLOP_PX = 14;

/** True when the pointer strayed far enough from the press point to be a drag. */
export const exceedsTapSlop = (dx: number, dy: number): boolean =>
  Math.hypot(dx, dy) > STORE_TAP_SLOP_PX;

let down = false;
let startX = 0;
let startY = 0;
let dragged = false;

const attached = new WeakSet<object>();

/** Whether the press that is ending (or just ended) was a drag. */
export const storePressWasDrag = (): boolean => dragged;

type ListLike = {
  addEventListener: (type: string, fn: (e: any) => void) => void;
  worldToLocal?: (v: any) => { x: number; y: number };
  size?: { value?: number[] | undefined };
};

/** Attach once per list object; tracks press-to-pointer distance in list px. */
export function attachStoreDragGuard(list: ListLike): void {
  if (attached.has(list)) return;
  attached.add(list);
  const local = (e: any): { x: number; y: number } | null => {
    if (e?.point == null || typeof list.worldToLocal !== 'function') return null;
    const p = list.worldToLocal(e.point.clone());
    const w = Number(list.size?.value?.[0] ?? 1);
    const h = Number(list.size?.value?.[1] ?? 1);
    return { x: p.x * w, y: p.y * h };
  };
  list.addEventListener('pointerdown', (e: any) => {
    const p = local(e);
    down = p != null;
    dragged = false;
    if (p != null) {
      startX = p.x;
      startY = p.y;
    }
  });
  list.addEventListener('pointermove', (e: any) => {
    if (!down || dragged) return;
    const p = local(e);
    if (p != null && exceedsTapSlop(p.x - startX, p.y - startY)) dragged = true;
  });
  const end = (): void => {
    down = false;
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}
