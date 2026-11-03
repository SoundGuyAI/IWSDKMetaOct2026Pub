# Wall Tones progress

Update this file as work proceeds. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. Times are Asia/Jerusalem.

## Not started

- [ ] Replace the Wall Tones placeholder panel with mode choice, best streak, and round status. Keep `back-to-menu-button`.
- [ ] Add `src/wall-tones/` for setup, pad volumes, sequence state, and speech. Register the systems from `src/index.ts`. Run only while the mode is `walltones`.
- [ ] Desktop: spawn four pads in a 2 by 2 grid in front of the player, skip scanning, and accept a click as a touch.
- [ ] Sequence rules: playback, growing sequence, wrong touch resets the current run to one note, best streak stays, streak clears when returning to the menu.
- [ ] English `speechSynthesis` lines, cancelled on exit and when a new line starts.
- [ ] Headset: passthrough session with plane detection, anchors, and hand tracking, without changing the VR hub config for demo and meditation.
- [ ] Room scale: four 1 m pads on vertical planes, prefer one wall each, share a wall with about a 0.25 m gap when needed. If four will not fit, voice leads into air placement and no partial set is left behind.
- [ ] Sitting: four pads on one table plane, or the same air placement when no table qualifies.
- [ ] Air placement: four pinch-to-place steps. Pinch does not press a pad during play.
- [ ] Hands-only hits: index fingertip enters a thick box once per touch. Controllers do not count.
- [ ] Verify desktop play and leave Quest plane, anchor, and fingertip checks noted here if a headset was not available.

## In progress

## Done

## Notes
