import { expect, test } from '@playwright/test';
import { showXrEntryGate } from '../../src/wall-tones/xr-entry.js';

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
