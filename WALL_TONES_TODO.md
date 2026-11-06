# Wall Tones progress

Personal backlog for what still needs work — not an agent task list. Move items between sections as you go. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. Times are Asia/Jerusalem.

## Not started

- [ ] Setup window: bigger threshold angle to jump back into view
- [ ] Setup window: after mode is selected, place it a little farther away, a little higher, and make it draggable
- [ ] Bug: first box in the pattern is not blinking in VR (arrow also not showing)
- [ ] Allow clicking the button with a ray
- [ ] Sports mode that disables ray button clicks
- [ ] Animation and juice
- [ ] Wrist band that shows the buttons playing the pattern
- [ ] Incremental features (park smaller follow-ups here as they come up)

### Minor polish - November 6
- [ ] Fade button transitions between lit and dim states in both directions.
- [ ] Add a skip dialog button.

### Future ideas - November 6,18:02 (backlog only, not implementation approval)
- [ ] Add a score that grows exponentially with streak length.
- [ ] Add a store where players can buy modifiers.
  - [ ] Your Turn hint modifier: each level gives 5 boxes of hints; buy upgrades for longer hints.
  - [ ] Auto-presser modifier.
  - [ ] Two more colored pads. In VR, the player would need to add them.
- [ ] Secret unlock: brainstorm what it should be.
- [ ] Story mode, told through the narrator. Open question: unlock it through the secret?
- [ ] New trailer hinting that this is an ARG game.
- [ ] Something flies out of the walls in MR after certain scores; in flat mode it flies into the screen, with a button to look at it. Details to brainstorm.
- [ ] Rickroll fanfare. Open question: how many buttons does it need, and are 6 enough?
- [ ] Save score, streak and settings locally.
- [ ] Achievements for streak, score, story and other milestones.

### MR and menu polish - November 6

- [ ] In mixed reality, investigate whether the boundary can be ignored.
- [ ] In MR, show subtitles at the bottom of the view, statically attached to the head, in a readable position.
- [ ] In the game menu, make the window draggable by default; remove the top button's drag-mode toggle.
- [ ] In setup mode, hide scoring info; show it only while the game loop is active.
- [ ] Before play-mode selection in setup mode, show the scanning data and allow a rescan.

## In progress

## Done

- [x] Blink uses the cube's own color (saturated, slightly lighter), not white. Checked with before/after frames of all four pad flashes in the desktop build. Not yet checked on a headset.
- [x] Replace the Wall Tones placeholder panel with mode choice, best streak, and round status. Keep `back-to-menu-button`.
- [x] Add `src/wall-tones/` for setup, pad volumes, sequence state, and speech. Register the systems from `src/index.ts`. Run only while the mode is `walltones`.
- [x] Desktop: spawn four pads in a 2 by 2 grid in front of the player, skip scanning, and accept a click as a touch.
- [x] Sequence rules: playback, growing sequence, wrong touch resets the current run to one note, best streak stays, streak clears when returning to the menu.
- [x] English `speechSynthesis` lines, cancelled on exit and when a new line starts.
- [x] Headset: passthrough session with plane detection, anchors, and hand tracking, without changing the VR hub config for demo and meditation.
- [x] Room scale: four 1 m pads on vertical planes, prefer one wall each, share a wall with about a 0.25 m gap when needed. If four will not fit, voice leads into air placement and no partial set is left behind.
- [x] Sitting: four pads on one table plane, or the same air placement when no table qualifies.
- [x] Air placement: four pinch-to-place steps. Pinch does not press a pad during play.
- [x] Hands-only hits: index fingertip enters a thick box once per touch. Controllers do not count.
- [x] Verify desktop play and leave Quest plane, anchor, and fingertip checks noted here if a headset was not available.

## Notes

- **2026-11-06 (Asia/Jerusalem):** Moved the future ideas and polish lists in from `todo.md` at the owner's request.

- **2026-11-03 (Asia/Jerusalem):** Desktop round verified in the managed browser (screenshot + recording). Quest passthrough, plane placement, anchors, and live fingertip hits were not run in this session — no headset attached to the cloud agent. Use the dev tunnel URL on a Quest to validate AR setup.
- **2026-11-03 (Asia/Jerusalem):** Fixed flat/desktop pad placement (camera-relative grid; was spawning under the floor at player origin). Automated flat play reached **best streak 10** via `scripts/wall-tones-streak-10.mjs`.
- **2026-11-03 (Asia/Jerusalem):** Fixed Quest/browser audio (unlock Web Audio on menu + first pad tap) and flat start (pads were ignored until tap-to-start). Moved/shrank HUD and enlarged pad hit boxes so all four grid pads are reachable.
- **2026-11-03 (Asia/Jerusalem):** Quieter voice (streak praise every 5 only); stronger pad tones (pointerdown audio priming + HTML WAV fallback).
- **2026-11-03 (Asia/Jerusalem):** Air placement no longer sticks a solid pad on the face — ghost follows the hand as a hollow outline, stays ≥ ~0.7 m from the eyes, uses smaller sitting pads, and solidifies on pinch.
