import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Owner's Nov 16 test-mode request on the nod lab: a gesture-recording
// toggle, a reset-position button that re-anchors the baseline as if the
// question was just asked, and a brief green/red flash on the Yes/No
// buttons when an answer is detected. These guard the wiring (buttons
// exist, handlers bound, flash + recapture implemented) so a later refactor
// cannot silently drop the test mode.

const uikitml = readFileSync(
  new URL('../../public/ui/nod-lab.uikitml', import.meta.url),
  'utf8',
);
const system = readFileSync(
  new URL('../../src/nod-lab/nod-lab-system.ts', import.meta.url),
  'utf8',
);

test('the nod lab panel offers the record and reset test buttons', () => {
  assert.ok(uikitml.includes('id="nod-lab-record-button"'));
  assert.ok(uikitml.includes('id="nod-lab-reset-button"'));
  assert.ok(uikitml.includes('id="nod-lab-record-label"'));
});

test('record and reset buttons are bound in the system', () => {
  assert.ok(system.includes("getElementById('nod-lab-record-button')"));
  assert.ok(system.includes("getElementById('nod-lab-reset-button')"));
  assert.ok(system.includes('toggleRecording()'));
  assert.ok(system.includes('recaptureBaseline()'));
});

test('reset re-anchors every baseline source, not only the headset one', () => {
  // The plain arm path deliberately leaves the pointer/tilt trackers alone;
  // the explicit reset button must re-anchor them too.
  const resetBody = system.slice(
    system.indexOf('private recaptureBaseline()'),
    system.indexOf('private flashAnswerButton'),
  );
  for (const call of [
    'this.detector.reset()',
    'this.flatDetector.reset()',
    'this.pointerTracker.reset()',
    'this.tiltTracker.reset()',
    'getWorldQuaternion(this.baselineQuat)',
  ]) {
    assert.ok(resetBody.includes(call), `recaptureBaseline must call ${call}`);
  }
});

test('detected answers flash the Yes/No buttons green and red', () => {
  assert.ok(system.includes('flashAnswerButton(answer)'));
  assert.ok(system.includes("answer === 'yes' ? 0x2e9e4f : 0xd33f2f"));
  assert.ok(system.includes('restoreAnswerButtons'));
});

test('recorded gestures keep samples and detected answers', () => {
  assert.ok(system.includes('this.recSamples.push'));
  assert.ok(system.includes('this.recEvents.push'));
  assert.ok(system.includes('getRecording'));
});

test('recording detects gestures without waiting for a story question', () => {
  // Shadow detectors report (flash + recorded event) while no prompt is
  // listening; the story path alone would leave the tester waiting through
  // dialogue (owner, Nov 16 diagnostic intent).
  assert.ok(system.includes('recDetectorHeadset'));
  assert.ok(system.includes('recDetectorFlat'));
  assert.ok(system.includes('feedRecordingDetector'));
  assert.ok(system.includes('this.flatDetector.isEnabled || this.recording'));
});
