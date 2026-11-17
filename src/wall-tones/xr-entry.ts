import type { World } from '@iwsdk/core';
import { formatXrLog, recordXrEvent, watchXrWorld } from './xr-diagnostics.js';

/** World preparation is asynchronous; only this real DOM tap requests a session. */
export function showXrEntryGate(world: World): void {
  watchXrWorld(world, 'entry-gate');
  recordXrEvent('gate-shown', `session=${world.session != null} pending=${world.sessionRequestPending}`);
  document.getElementById('wall-tones-xr-entry')?.remove();
  const gate = document.createElement('div');
  gate.id = 'wall-tones-xr-entry';
  Object.assign(gate.style, {
    position: 'fixed', inset: '0', zIndex: '100002', background: '#081019',
    color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '18px', padding: '24px', textAlign: 'center',
    font: '18px/1.4 sans-serif',
  });
  const message = document.createElement('p');
  message.style.whiteSpace = 'pre-line';
  message.textContent = 'Ready to enter XR. The game starts only when you press Start in the menu.';
  const button = document.createElement('button');
  button.id = 'wall-tones-enter-xr';
  button.textContent = 'Enter XR';
  Object.assign(button.style, {
    background: '#ffe000', color: '#081019', border: '0', borderRadius: '14px',
    padding: '18px 42px', font: 'bold 24px sans-serif', cursor: 'pointer',
  });
  gate.append(message, button);
  document.body.appendChild(gate);
  button.addEventListener('click', () => {
    recordXrEvent('gate-tap', `session=${world.session != null} pending=${world.sessionRequestPending}`);
    if (world.session != null) { gate.remove(); return; }
    button.disabled = true;
    recordXrEvent('launch-called');
    message.textContent = 'Waiting for XR permission...';
    try {
      // No import, promise callback or await before the session request.
      world.launchXR();
    } catch (error) {
      recordXrEvent('launch-threw', String(error));
      message.textContent = `XR did not open. Check headset permissions and try again.\n${formatXrLog()}`;
      button.disabled = false;
      return;
    }
    const check = () => {
      if (!gate.isConnected) return;
      if (world.session != null) { recordXrEvent('gate-closed', 'session opened'); gate.remove(); return; }
      if (world.sessionRequestPending) { window.setTimeout(check, 100); return; }
      recordXrEvent('launch-no-session', 'request settled without a session');
      message.textContent = `XR did not open. Check headset permissions and try again.\n${formatXrLog()}`;
      button.disabled = false;
      button.textContent = 'Try Enter XR again';
    };
    window.setTimeout(check, 100);
  });
}
