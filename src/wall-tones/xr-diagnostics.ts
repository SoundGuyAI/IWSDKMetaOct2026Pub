/**
 * XR lifecycle log for the enter -> leave -> Enter XR again defect (backlog 76).
 * Diagnostics only: records what happens, changes no behaviour. The newest
 * entries are shown on the XR gate when a session fails to open and are
 * readable from window.__xrLifecycle() on a headset browser or desktop.
 */
export interface XrLogEntry {
  t: number;
  event: string;
  detail?: string;
}

const MAX_ENTRIES = 60;
const entries: XrLogEntry[] = [];
const watchedWorlds = new WeakSet<object>();
let consoleHooked = false;

export function recordXrEvent(event: string, detail?: string): void {
  entries.push({ t: Math.round(performance.now()), event, detail });
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

export function getXrLog(): readonly XrLogEntry[] {
  return entries;
}

/** Compact multi-line text of the newest entries, for the gate and bug reports. */
export function formatXrLog(count = 6): string {
  return entries
    .slice(-count)
    .map((e) => `${e.t}ms ${e.event}${e.detail ? ` ${e.detail}` : ''}`)
    .join('\n');
}

interface WatchableWorld {
  session?: unknown;
  sessionRequestPending?: boolean;
  visibilityState?: { subscribe(fn: (state: unknown) => void): unknown };
}

/** Log visibility changes (session start/end) once per world, plus SDK XR errors. */
export function watchXrWorld(world: WatchableWorld, label: string): void {
  if (!consoleHooked && typeof console !== 'undefined') {
    consoleHooked = true;
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (first.startsWith('[XR]') || first.startsWith('XRSession')) {
        recordXrEvent(
          'sdk-error',
          args
            .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
            .join(' ')
            .slice(0, 160),
        );
      }
      original(...args);
    };
  }
  if (typeof window !== 'undefined') {
    (window as unknown as { __xrLifecycle?: () => readonly XrLogEntry[] }).__xrLifecycle =
      getXrLog;
  }
  if (watchedWorlds.has(world)) {
    return;
  }
  watchedWorlds.add(world);
  recordXrEvent('watch-world', label);
  world.visibilityState?.subscribe((state) => {
    recordXrEvent(
      'visibility',
      `${String(state)} session=${world.session != null} pending=${world.sessionRequestPending === true}`,
    );
  });
}
