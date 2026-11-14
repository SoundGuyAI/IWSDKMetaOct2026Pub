/**
 * TEMPORARY diagnostic for PR95 (Quest drag-scroll investigation, 2026-11-14).
 * Only active with ?scrollDebug=1 on the URL. Counts the pointer events that
 * reach the store tree list, whether uikit started a drag, how far the ray
 * moved while pressed and how far the list actually scrolled. Remove after
 * the cause is found.
 */

export const SCROLL_DEBUG =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('scrollDebug');

type Counts = {
  down: number;
  move: number;
  moveWhileDown: number;
  up: number;
  cancel: number;
  leave: number;
  wheel: number;
  scroll: number;
  ukMax: number;
  lastType: string;
  lastId: string;
  /** Net / largest ray movement while pressed, in list px (+ = up on screen). */
  dyNet: number;
  dyMaxUp: number;
  dyMaxDown: number;
  /** Extremes of the list scroll position seen (negative = overscroll). */
  yMin: number;
  yMax: number;
  noPoint: number;
};

export const scrollDebugCounts: Counts = {
  down: 0,
  move: 0,
  moveWhileDown: 0,
  up: 0,
  cancel: 0,
  leave: 0,
  wheel: 0,
  scroll: 0,
  ukMax: 0,
  lastType: '-',
  lastId: '-',
  dyNet: 0,
  dyMaxUp: 0,
  dyMaxDown: 0,
  yMin: 0,
  yMax: 0,
  noPoint: 0,
};

const attached = new WeakSet<object>();
let isDown = false;
let prevY: number | null = null;

/** Attach counting listeners once per list object. */
export function attachStoreScrollDebug(list: any): void {
  if (!SCROLL_DEBUG || attached.has(list)) return;
  attached.add(list);
  const c = scrollDebugCounts;
  // Count real scroll attempts on the STORE list (uikit calls this from its
  // scroll step, before it applies the move).
  list.setProperties({
    onScroll: () => {
      c.scroll++;
    },
  });
  const localY = (e: any): number | null => {
    if (e?.point == null || typeof list.worldToLocal !== 'function') return null;
    const p = list.worldToLocal(e.point.clone());
    const h = Number(list.size?.value?.[1] ?? 1);
    return p.y * h;
  };
  const note = (e: any): void => {
    c.lastType = String(e?.nativeEvent?.pointerType ?? 'xr/none');
    c.lastId = String(e?.pointerId ?? '-');
  };
  list.addEventListener('pointerdown', (e: any) => {
    c.down++;
    isDown = true;
    prevY = localY(e);
    note(e);
  });
  list.addEventListener('pointermove', (e: any) => {
    c.move++;
    note(e);
    if (!isDown) return;
    c.moveWhileDown++;
    const y = localY(e);
    if (y == null) {
      c.noPoint++;
      return;
    }
    if (prevY != null) {
      const dy = y - prevY;
      c.dyNet += dy;
      if (dy > c.dyMaxUp) c.dyMaxUp = dy;
      if (dy < c.dyMaxDown) c.dyMaxDown = dy;
    }
    prevY = y;
  });
  list.addEventListener('pointerup', () => {
    c.up++;
    isDown = false;
  });
  list.addEventListener('pointercancel', () => {
    c.cancel++;
    isDown = false;
  });
  list.addEventListener('pointerleave', () => {
    c.leave++;
  });
  list.addEventListener('wheel', () => {
    c.wheel++;
  });
}

/** Two-line readout (uikit's own drag map size shows if it began a drag). */
export function scrollDebugText(list: any): string {
  const c = scrollDebugCounts;
  const uk = Number(list?.downPointerMap?.size ?? -1);
  if (uk > c.ukMax) c.ukMax = uk;
  const y = Number(list?.scrollPosition?.value?.[1] ?? 0);
  const maxY = Math.round(list?.maxScrollPosition?.value?.[1] ?? 0);
  if (y < c.yMin) c.yMin = y;
  if (y > c.yMax) c.yMax = y;
  const r = (n: number): number => Math.round(n);
  return `dn${c.down} mv${c.move}/${c.moveWhileDown} up${c.up} cx${c.cancel} lv${c.leave} sc${c.scroll} uk${uk}/${c.ukMax} np${c.noPoint}\ny${r(y)}/${maxY} ymin${r(c.yMin)} ymax${r(c.yMax)} dyNet${r(c.dyNet)} up${r(c.dyMaxUp)} dn${r(c.dyMaxDown)} ${c.lastType}`;
}
