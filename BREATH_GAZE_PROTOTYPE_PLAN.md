# Breath and probable eye-closure prototype

## Goal

Build an IWSDK WebXR experience for Quest Pro and Meta VR Glasses that:

1. asks the user to begin sensing and then speaks, “Take a slow breath, then close your eyes”;
2. estimates breathing from microphone airflow plus subtle vertical headset motion;
3. treats sustained loss of a previously valid gaze pose as **probably closed** only while the XR session and head pose remain healthy;
4. plays a soft low confirmation tone when closure is inferred;
5. plays a brighter rising tone when valid gaze returns;
6. reports `unavailable` or `blink_or_uncertain` instead of claiming eye closure when the evidence is ambiguous.

This is a wellness/interaction prototype, not a medical device or an authoritative eyelid sensor.

## Sensor model

### Gaze and probable closure

IWSDK requests optional `gazeTracking` and supplies its normal gaze interaction system. A small application system independently checks the raw WebXR gaze target-ray pose each frame.

The classifier requires:

- an active and visible XR session;
- a valid viewer/head pose;
- at least one second of previously valid gaze;
- continuous gaze loss for 650 ms before entering `probably_closed`;
- 200 ms of restored valid gaze before returning to `open`.

Short losses are reported as `blink_or_uncertain`. Loss of the XR session or viewer pose is `unavailable` and never triggers the closed sound. WebXR exposes one combined gaze ray, not independent eyelid values, so “probably closed” can also mean eye-tracker occlusion or looking outside its tracking range.

### Breathing

The microphone is requested only after a user gesture. Audio stays local and is reduced to a root-mean-square airflow-energy value; raw audio is neither recorded nor uploaded. If microphone access is unavailable, the gaze audio cues remain active and breathing falls back to a clearly labeled head-motion-only estimate.

The headset’s world-space vertical position is low-pass filtered into a slow motion estimate. The prototype fuses:

- microphone energy above a calibrated ambient-noise floor;
- slow upward motion as supporting evidence for inhale;
- slow downward motion as supporting evidence for exhale.

The first three seconds establish microphone and head-motion baselines. When the signals disagree or are too weak, the result is `quiet_or_uncertain`. Head motion is supporting evidence only: posture changes, walking, and nodding can overwhelm respiratory motion.

## Experience flow

1. The user selects **Start guided sensing** in the browser overlay, granting microphone permission.
2. The user enters XR and looks around long enough to establish valid gaze.
3. After the gaze baseline is established, the app speaks the close-eyes instruction.
4. The status overlay reports breathing phase, gaze availability, and eye-state inference.
5. Sustained gaze loss with healthy head tracking plays the closed tone once.
6. Stable gaze restoration plays the open tone once.
7. **Stop sensing** releases the microphone, cancels speech, and resets inferred state.

## Hardware validation

The desktop IWSDK emulator uses the `metaVRGlasses` profile to prove control flow, gaze loss/restoration, audio transitions, and narrow-field layout. It does not prove real eye tracking.

On each target headset/browser version:

1. verify that `gaze-tracking` is granted;
2. verify that the gaze ray separates from head direction;
3. close the eyes repeatedly and record whether the runtime returns a null gaze pose, freezes the last pose, or removes the gaze source;
4. tune closure and reopen delays from those observations;
5. test false positives from blinking, looking to the edge, headset adjustment, system UI, and tracking degradation;
6. compare breathing labels against manually marked slow breaths in quiet and noisy rooms.

If the runtime continues to return a valid gaze pose with closed eyes, IWSDK/WebXR cannot infer closure on that device; the prototype must not claim that closure detection is supported there.

## Acceptance criteria

- TypeScript and production builds pass.
- Microphone access begins only from the start button and tracks are stopped on cleanup.
- The spoken instruction and distinct closed/open tones are each transition-gated.
- A gaze loss shorter than 650 ms does not emit the closed tone.
- Viewer-pose or XR-session loss produces `unavailable`, not `probably_closed`.
- Restored gaze must remain valid for 200 ms before the open tone plays.
- The UI clearly labels all breathing and eye-state outputs as estimates.
- No raw microphone or gaze history leaves the device.

