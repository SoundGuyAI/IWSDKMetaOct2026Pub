# Nod yes/no lab - research notes

Isolated test scene for head nod (yes) and head shake (no) detection
(backlog item 52, requested 2026-11-11; isolated-scene research PR requested
2026-11-12). Entry: main menu > "Nod Yes/No Lab". The scene is a branching
Cypher dialogue: he asks, you nod or shake, he repeats the detected answer
("Yes." / "No.") and branches.

This is a research scene. It exists to find out how well head gestures work
as input on the real headset, not to claim a finished input method.

## Lab fiction premise (narrow, lab-only)

The dialogue says Cypher "can see you through the link". That is a
diagnostic premise for this isolated lab only: the reviewed Act 1 draft
(CYPHER_DIALOGUE.md, scene 09 staging) deliberately grants Cypher no new
camera or room-surveillance capability. This lab does not extend Act 1.
If gesture answers ever join the production story, how Cypher receives them
is Oded's decision first.

## How detection works

- While a prompt awaits an answer, the current head orientation becomes the
  baseline. Per-frame pitch (nod axis) and yaw (shake axis) relative to that
  baseline feed the detector (`src/nod-lab/head-gesture.ts`).
- An axis arms when its angle passes the activation threshold (8 deg); the
  extreme is committed when the head reverses by 6 deg from it. A committed
  extreme of at least 14 deg that completes out-and-back within 1.4 s is one
  gesture cycle. Pitch cycle = yes, yaw cycle = no.
- Cross-talk guard: the winning axis must show at least 1.6x the other
  axis's recent excursion. A 1.2 s cooldown follows every reported gesture,
  and detection only runs while a prompt is armed.
- Detection requires an immersive session (head pose). Flat mode answers
  with the on-panel Yes/No buttons or the Y/N keys; the dialogue is
  identical. The panel shows live pitch/yaw, detector state and the last
  classification so misreads are visible immediately.

## Flat-mode gesture inputs (added Nov 14)

Owner request (Nov 14): desktop and mobile need real gestures too, not
only buttons.

- Desktop: a mouse drag that swings up-and-down answers yes, left-right
  answers no (`src/nod-lab/pointer-gesture.ts`). Pointer positions become
  baseline-relative degrees (3 px per degree) and feed the SAME detector,
  configured with `returnToBaselineRad` so a cycle completes only on a
  true out-and-back swing: a one-way drag toward the buttons never
  answers. After a pause over 0.6 s the baseline re-anchors at the
  pointer's resting spot and the detector resets (a stale anchor would
  otherwise break the return-to-baseline reading); the 0.6 s limit sits
  inside the 1.4 s gesture window, which assumes roughly frame-rate event
  delivery - true on real devices, while very slow renderers can stretch
  a swing past the window.
- Mobile: the Start tap asks once for motion access where the platform
  gates it (iOS `DeviceOrientationEvent.requestPermission()`); granted,
  tilting the phone forward/back answers yes, left/right answers no
  (deviceorientation beta/gamma, `src/nod-lab/tilt-gesture.ts`). A denial
  or a device without the API is respected silently - no re-asking, no
  listener, pointer drag and buttons keep working.
- Both paths sample sensors only while a lab prompt is listening; nothing
  is tracked outside the lab. Headset detection is unchanged
  (`returnToBaselineRad: null`).

## Voice

Lines are Cypher clips (Kore F / Algenib M, opposite the narrator) specified
in `docs/CYPHER_LAB_CLIPS.md` and shipped in this PR under
`public/audio/speech/cypher-lab/<set>/` (26 mp3s, converted from the audio
worker's 24 kHz mono processed masters with the Act 1 radio chain and quiet
static baked in; ffmpeg -q:a 4). The panel voice line shows the active set.
The audio worker's QC: per-clip transcript match 0.95-1.00, no within-set
pitch outliers, coverage >= 0.89; nobody has listened to the clips yet, so
the ear check remains Oded's test. Voices off (accessibility) forces a
text-only mode.

## Verified in this PR

- TypeScript, production build, unit tests, e2e suite (flat Chromium):
  menu button wiring, full dialogue tree across both branches and the
  intro retry loop, answer echo order, detector unit behavior (nod, shake,
  rejection of slow drifts, small wobbles and mixed-axis motion, cooldown,
  pointer-drag and tilt gesture classification, rejection of one-way
  drags, rested-spot wiggles and drags that never return to baseline).
- Preview loads on desktop; the lab opens, runs and returns to the menu.
- Flat-mode pointer gestures e2e: a scripted down-up pointer swing answers
  yes and a left-right swing answers no on the live dialogue (real window
  pointermove path).

## NOT verified - needs Oded's pass

- Phone tilt on real iOS/Android hardware: the permission prompt copy,
  axis feel (beta/gamma, portrait only) and sensitivity. Everything
  sensor-side was verified by unit test only; no real device run yet.
- Mouse-drag gesture feel on a real desktop browser (event rate, swing
  size): e2e proves the path, not the ergonomics.

## NOT verified - needs Oded's headset pass

- Real nod/shake recognition on the Quest: threshold feel (8/14 deg, 1.4 s),
  false positives while reading the panel or looking around, and the
  baseline capture moment. Tune `DEFAULT_HEAD_GESTURE_CONFIG` from what the
  telemetry line shows.
- The lab panel in the AR world sits at the main menu's anchor and does not
  follow the player yet (the menu follow from item 47 targets the menu
  panel only).
- Cypher voice clips are integrated but unheard; the ear check (identity,
  levels, radio effect feel) is part of Oded's pass.

## Known limits

- A fast deliberate look down and back up inside the window can read as a
  nod; the thresholds trade responsiveness against false triggers and are
  expected to move after headset testing.
- Baseline is the head pose at the moment the prompt arms; large posture
  shifts mid-answer degrade the reading. Re-baseline happens per prompt.
