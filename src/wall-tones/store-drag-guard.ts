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
let tapAction: (() => void) | undefined;
let releasedTap = false;
let releasedAt = 0;

const attached = new WeakSet<object>();

/** A new press began on a tile: forget any earlier drag. */
export const resetStorePress = (action?: () => void): void => {
  dragged = false;
  releasedTap = false;
  tapAction = action;
};

/** A release already handled this tap; ignore its synthetic follow-up click.
 * Rebuilding the tree blocks the main thread, so the same release's click can
 * arrive over a second later. The next pointerdown always clears this token;
 * the timeout only protects later click-only input that has no pointerdown.
 */
export const storeTapHandledOnRelease = (now = performance.now()): boolean => {
  const handled = releasedTap && now - releasedAt < 3000;
  releasedTap = false;
  return handled;
};

/**
 * uikit `onScroll` hook for the Store list (runs on every scroll step).
 *
 * 1. uikit stamps a "was scrolled" flag on the pointer's native event and
 *    zeroes later deltas while it is set. XR pointers reuse ONE native-event
 *    object for every move of every drag, so after the first few px the flag
 *    stays set and the drag stalls (and later drags never start). The Store
 *    list has no nested scroller to protect, so clear the flag every step.
 * 2. Click suppression is decided by press movement, not a scroll callback.
 *    Even a stationary XR ray can produce tiny scroll deltas from hand jitter.
 */
export function storeListOnScroll(
  newX: number,
  newY: number,
  scrollPosition: { value?: number[] | undefined } | undefined,
  event?: { nativeEvent?: unknown },
): undefined {
  const ne = event?.nativeEvent;
  if (ne != null && typeof ne === 'object') {
    for (const sym of Object.getOwnPropertySymbols(ne)) {
      if (sym.description === 'was-scrolled') (ne as Record<symbol, unknown>)[sym] = undefined;
    }
  }
  return undefined;
}

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
  list.addEventListener('pointerup', () => {
    const action = down && !dragged ? tapAction : undefined;
    tapAction = undefined;
    down = false;
    if (action != null) {
      releasedTap = true;
      releasedAt = performance.now();
      action();
    }
  });
  list.addEventListener('pointercancel', () => {
    tapAction = undefined;
    end();
  });
}
