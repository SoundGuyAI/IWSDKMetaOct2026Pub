# Thumbs yes/no lab - research notes

Isolated test scene for thumbs up (yes) and thumbs down (no) hand-gesture
detection (backlog item 52, requested 2026-11-11; isolated-scene research PR
requested 2026-11-12). Entry: main menu > "Thumbs Yes/No Lab". Branching
Cypher dialogue: he asks, you show a thumb, he repeats the detected answer
("Yes." / "No.") and branches.

This is a research scene. It exists to find out how well thumb gestures work
as input on the real headset, not to claim a finished input method.

## Lab fiction premise (narrow, lab-only)

The dialogue says Cypher "can see you through the link". That is a
diagnostic premise for this isolated lab only: the reviewed Act 1 draft
(CYPHER_DIALOGUE.md, scene 09 staging) deliberately grants Cypher no new
camera or room-surveillance capability. This lab does not extend Act 1.
If gesture answers ever join the production story, how Cypher receives them
is Oded's decision first.

## How detection works

- While a prompt awaits an answer, each tracked hand's joints are sampled
  from the live XR frame (wrist, thumb proximal phalanx, thumb tip, index
  and middle proximal phalanxes and tips) and classified in
  `src/thumbs-lab/thumbs-gesture.ts`.
- Thumbs up: thumb extended (tip farther from the wrist than its base
  joint), index and middle fingers curled (tips closer to the wrist than
  their knuckles), and the thumb direction within about 49 deg of world up
  (alignment >= 0.65). Thumbs down: the same with alignment <= -0.65.
- A pose must hold for 0.3 s before it reports; a 1.2 s cooldown follows
  every report, and detection only runs while a prompt is armed.
- Detection requires an immersive session with hand tracking. Flat mode
  answers with the on-panel Yes/No buttons or the Y/N keys. The panel shows
  per-hand tracking state, live thumb alignment, detector state and the last
  classification so misreads are visible immediately.

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
  intro retry loop, answer echo order, classifier unit behavior (up, down,
  rejection of open palm / fist without thumb extension / horizontal thumb,
  hold-time and cooldown).
- Preview loads on desktop; the lab opens, runs and returns to the menu.

## NOT verified - needs Oded's headset pass

- Real thumb pose recognition with Quest hand tracking: alignment threshold
  feel (0.65), hold time (0.3 s), false positives while resting or pinching
  UI, and behavior at extreme arm angles (see limits). Tune
  `DEFAULT_THUMB_GESTURE_CONFIG` from what the telemetry line shows.
- The lab panel in the AR world sits at the main menu's anchor and does not
  follow the player yet (the menu follow from item 47 targets the menu
  panel only).
- Cypher voice clips are integrated but unheard; the ear check (identity,
  levels, radio effect feel) is part of Oded's pass.

## Known limits

- Thumb direction is compared with world up: holding the hand above the
  head or below the waist rotates the wrist reference and weakens the
  read. A forearm-relative up axis is the obvious next iteration if the
  headset pass shows it.
- Relaxed hands can sit between curled and extended; the curl/extension
  ratios trade sensitivity against false triggers and are expected to move
  after headset testing.
- Only index and middle fingers gate the fist; ring/pinky state is ignored
  on purpose (Quest joint noise is worst there).
