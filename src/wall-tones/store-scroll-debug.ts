/**
 * TEMPORARY diagnostic for PR95 (Quest drag-scroll investigation, 2026-11-14).
 * Only active with ?scrollDebug=1 on the URL. Counts the pointer events that
 * reach the store tree list and whether uikit started a drag on it, so one
 * Quest test shows which stage of press-and-drag fails. Remove after the
 * cause is found.
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
};

const attached = new WeakSet<object>();
let isDown = false;

/** Attach counting listeners once per list object. */
export function attachStoreScrollDebug(list: {
  addEventListener: (type: string, fn: (e: any) => void) => void;
}): void {
  if (!SCROLL_DEBUG || attached.has(list)) return;
  attached.add(list);
  const c = scrollDebugCounts;
  const note = (e: any): void => {
    c.lastType = String(e?.nativeEvent?.pointerType ?? 'xr/none');
    c.lastId = String(e?.pointerId ?? '-');
  };
  list.addEventListener('pointerdown', (e) => {
    c.down++;
    isDown = true;
    note(e);
  });
  list.addEventListener('pointermove', (e) => {
    c.move++;
    if (isDown) c.moveWhileDown++;
    note(e);
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

/** One-line readout (uikit's own drag map size shows if it began a drag). */
export function scrollDebugText(list: any): string {
  const c = scrollDebugCounts;
  const uk = Number(list?.downPointerMap?.size ?? -1);
  if (uk > c.ukMax) c.ukMax = uk;
  const y = Math.round(list?.scrollPosition?.value?.[1] ?? 0);
  const maxY = Math.round(list?.maxScrollPosition?.value?.[1] ?? 0);
  return `dn${c.down} mv${c.move}/${c.moveWhileDown} up${c.up} cx${c.cancel} lv${c.leave} wh${c.wheel} sc${c.scroll} uk${uk}/${c.ukMax} y${y}/${maxY} ${c.lastType}#${c.lastId}`;
}
