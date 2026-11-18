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

- Desktop: moving the mouse up-and-down answers yes, left-right answers
  no (`src/nod-lab/pointer-gesture.ts`). Pointer positions become
  baseline-relative degrees (2 px per degree - tuned down from 3 on the
  owner's Nov 14 desktop pass, so a gesture peaks at ~28 px of travel
  instead of ~42 px; the jitter guard floor moved from +-20 px to +-12 px
  wiggles) and feed the SAME detector,
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
  listener, pointer drag and buttons keep working. The tilt baseline is
  not frozen at arm time: an anchor grabbed mid-motion makes the
  return-to-baseline requirement unachievable and every later gesture
  expires (the owner's Nov 14 iPhone failure: first yes registered,
  then nothing). While the phone reads as still the baseline tracks the
  resting pose (like the pointer path's re-prime), so a gesture always
  reads as out-and-back from where the phone actually rests.
- Desktop intro caption (owner, Nov 14): on flat desktop the intro line's
  shown text says to move the mouse up/down for yes and left/right for no
  instead of nodding your head. Display-only: the approved recorded line
  is unchanged, so desktop caption and audio intentionally differ until
  the owner approves a new take.
- No-input timeout (owner, Nov 14): about 6 s with no answer while a
  prompt is listening counts as another no-case - Cypher acknowledges
  that nothing came through and asks to try again, then the SAME prompt
  is re-armed (retry variations do not rotate, no answer cue, no advance
  in the tree). The timer runs only during the listening phase and pauses
  while the tab is hidden. The acknowledgment lines were approved
  verbatim by the owner Nov 14 and their clips are live.
  The prompt re-arms BEFORE the short device reminder plays, not after:
  the acknowledgment ends with "try again", the user's natural cue to
  move, and an arm that waited for the reminder to finish dropped every
  gesture made on that cue (owner's Nov 14 desktop retest). The no-input
  clock restarts when the reminder finishes, so the full timeout still
  runs from the end of speech.
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
- Phone tilt: iOS reflects gamma when the phone pitches past vertical
  (beta across +-90) and wraps beta at +-180. The tracker absorbs those
  single-event jumps into the baseline (Nov 14 iPhone failure: a forward
  nod across vertical read as a 76 deg "no"), but a gesture HELD past
  vertical still reads with mirrored roll until the phone comes back.
- Phone tilt clip probes: a transient fetch failure used to mute that clip
  (voice and static) for the rest of the session; only successful probes
  stay cached, so a failed clip re-probes on its next line.

## iPhone pass (Nov 17, feat/iphone-nod-sensitivity)

Owner request (Nov 16 23:34): "work on the sensitivity in iPhone and
getting the nods to work on iPhone too", after his Nov 16 01:52 report
that recognition was no longer 100%, with two questions:

- **Q1: are the thresholds different per platform?** Yes, since Nov 15:
  the headset uses `DEFAULT_HEAD_GESTURE_CONFIG`, flat mode (pointer AND
  phone tilt) uses `FLAT_HEAD_GESTURE_CONFIG` (arm 6, reverse 4, peak 10
  deg, dominance 2.0, return-to-baseline 6 deg). The Nov 16 threshold
  change (6/4/10 from his Quest capture) moved BOTH configs, so a
  headset fix can still shift iPhone behavior - this PR's panel now
  names the active preset in the telemetry so the tested values are
  always visible on-device.
- **Q2: does the orientation baseline reset between questions?** Not on
  each question by design: a mid-motion anchor makes the
  return-to-baseline requirement unachievable (the Nov 14 failure).
  Instead the baseline tracks the resting pose whenever the phone reads
  as still, and the panel's "Reset position" button re-anchors on demand
  as if the question was just asked.

What this pass changes:

- **Landscape fix.** Tilt axes assumed portrait (beta = nod, gamma =
  shake). Held in landscape, the same physical nod moves gamma, so it
  fed the shake axis - the likely mechanism behind "nod is not working
  and it's detecting it as a no" (Nov 16 00:05). Samples are now
  rotated into the screen frame (`rotateToScreenFrame`) using
  `screen.orientation.angle` (iOS `window.orientation` fallback), so
  forward/back is yes in any orientation. Gestures are symmetric, so
  only the axis mapping matters, never the sign. Known limit: in the
  near-vertical gimbal zone (|beta| > 80) gamma is untrusted on iOS, so
  landscape shakes cannot be read reliably while the phone is nearly
  upright; nods still read in portrait there. This affects the edge
  case only - normal holding angles sit outside the zone.
- **Sensitivity selector.** New panel button toggles the flat tuning
  between Standard (6/4/10 deg) and Sensitive (5/3.5/8 deg, return 5
  deg), applied live to both the answering detector and the recording
  shadow detector and persisted in localStorage. His Nov 15 dataset
  peaks at 10-22 deg, so the Standard peak floor sat exactly at the
  gentle end; Sensitive qualifies those. Dominance stays 2.0 in both:
  the Nov 15 trace showed relaxing it is what let yaw wobble misread a
  nod as a shake.
- No changes to the headset config, the dialogue, clips or captions.

Verification: 247 unit tests green (6 new: rotation math, same nod
detected at 0/90/270, gentle-nod preset behavior, dominance guard
kept, live config swap, panel wiring), tsc + vite build clean. Real
iPhone confirmation is Oded's pass: try portrait and landscape, both
sensitivities, and send a "Record gestures" capture (clipboard paste)
if anything still misreads.
