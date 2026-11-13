import { expect, test } from '@playwright/test';
import { showXrEntryGate } from '../../src/wall-tones/xr-entry.js';
import { getXrLog } from '../../src/wall-tones/xr-diagnostics.js';

class ElementStub extends EventTarget {
  id = ''; textContent = ''; style = {}; disabled = false; isConnected = true;
  children: ElementStub[] = [];
  append(...children: ElementStub[]) { this.children.push(...children); }
  appendChild(child: ElementStub) { this.children.push(child); }
  remove() { this.isConnected = false; }
}

test('XR gate requests synchronously from a tap, retries rejection, and closes only for a session', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const timers: Array<() => void> = [];
  const body = new ElementStub();
  Object.assign(globalThis, {
    document: { body, createElement: () => new ElementStub(), getElementById: () => null },
    window: { setTimeout: (fn: () => void) => { timers.push(fn); return 1; } },
  });
  let calls = 0;
  const world = {
    session: null as object | null, sessionRequestPending: false,
    launchXR() { calls++; this.sessionRequestPending = true; },
  };
  try {
    showXrEntryGate(world as any);
    const gate = body.children[0]!;
    const [message, button] = gate.children;
    expect(calls).toBe(0);
    button!.dispatchEvent(new Event('click'));
    expect(calls).toBe(1); // no promise/microtask before request
    expect(button!.disabled).toBe(true);
    timers.shift()!();
    expect(gate.isConnected).toBe(true); // pending is not success
    world.sessionRequestPending = false;
    timers.shift()!();
    expect(message!.textContent).toContain('XR did not open');
    expect(button!.disabled).toBe(false);
    button!.dispatchEvent(new Event('click'));
    expect(calls).toBe(2);
    world.session = {};
    timers.shift()!();
    expect(gate.isConnected).toBe(false);
  } finally {
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  }
});

test('XR gate works again after a session ends (enter, leave, Enter XR) and logs the lifecycle', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const timers: Array<() => void> = [];
  const body = new ElementStub();
  Object.assign(globalThis, {
    document: { body, createElement: () => new ElementStub(), getElementById: () => null },
    window: { setTimeout: (fn: () => void) => { timers.push(fn); return 1; } },
  });
  const world = {
    session: null as object | null, sessionRequestPending: false, launches: 0,
    launchXR() {
      // Mirrors the SDK: a live session blocks, an ended one does not.
      if (this.session != null || this.sessionRequestPending) return;
      this.launches++;
      this.session = {};
    },
  };
  try {
    showXrEntryGate(world as any);
    const first = body.children[0]!;
    first.children[1]!.dispatchEvent(new Event('click'));
    expect(world.launches).toBe(1);
    timers.shift()!();
    expect(first.isConnected).toBe(false);
    world.session = null; // user leaves XR; the SDK clears the session
    showXrEntryGate(world as any); // main-menu Enter XR reuses the live world
    const second = body.children[body.children.length - 1]!;
    expect(second).not.toBe(first);
    second.children[1]!.dispatchEvent(new Event('click'));
    expect(world.launches).toBe(2);
    timers.shift()!();
    expect(second.isConnected).toBe(false);
    const events = getXrLog().map((e) => e.event);
    expect(events.filter((e) => e === 'gate-shown').length).toBeGreaterThanOrEqual(2);
    expect(events.filter((e) => e === 'launch-called').length).toBeGreaterThanOrEqual(2);
  } finally {
    Object.assign(globalThis, { window: oldWindow, document: oldDocument });
  }
});
