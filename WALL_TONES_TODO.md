# Wall Tones progress

Personal backlog for what still needs work — not an agent task list. Move items between sections as you go. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. Times are Asia/Jerusalem.

## Not started

- [ ] 1. Setup window: bigger threshold angle to jump back into view
- [ ] 2. Setup window: after mode is selected, place it a little farther away, a little higher, and make it draggable
- [ ] 3. Bug: first box in the pattern is not blinking in VR (arrow also not showing)
- [ ] 4. Allow clicking the button with a ray
- [ ] 5. Sports mode that disables ray button clicks
- [ ] 6. Animation and juice
- [ ] 7. Wrist band that shows the buttons playing the pattern
- [ ] 8. Incremental features (park smaller follow-ups here as they come up)

### Future ideas - November 6,18:02 (backlog only, not implementation approval)
- [ ] 11. Add a score that grows exponentially with streak length.
   - [ ] 11a. Add player-applied multipliers to the scoring system; mechanics unspecified.
- [ ] 12. Add a store where players can buy modifiers.
   - [ ] 12a. Your Turn hint modifier: each level gives 5 boxes of hints; buy upgrades for longer hints.
   - [ ] 12b. Auto-presser modifier.
   - [ ] 12c. Two more colored pads. In VR, the player would need to add them.
- [ ] 13. Secret unlock: brainstorm what it should be.
- [ ] 14. Story mode, told through the narrator. Open question: unlock it through the secret?
- [ ] 15. New trailer hinting that this is an ARG game.
- [ ] 16. Something flies out of the walls in MR after certain scores; in flat mode it flies into the screen, with a button to look at it. Details to brainstorm.
- [ ] 17. Rickroll fanfare. Open question: how many buttons does it need, and are 6 enough?
- [ ] 18. Save score, streak and settings locally.
- [ ] 19. Achievements for streak, score, story and other milestones.

### MR and menu polish - November 6

- [ ] 21. In MR, show subtitles at the bottom of the view, statically attached to the head, in a readable position.
- [ ] 22. In the game menu, make the window draggable by default; remove the top button's drag-mode toggle.
- [ ] 23. In setup mode, hide scoring info; show it only while the game loop is active.
- [ ] 24. Before play-mode selection in setup mode, show the scanning data and allow a rescan.
- [ ] 25. In setup mode, keep the menu panel from hiding behind the selection ray when it points at something in the environment to scan: ray-aware placement, a smart reverse of follow-the-look. Maybe also move the panel a little up, since there will probably not be things on the ceiling to select (tentative).
- [ ] 26. Tabletop pads: shrink the panel buttons on the table from 25x25 to 20x20 if four of them cannot fit on one table.
- [ ] 27. Add another play mode that combines both walls and tables.
- [ ] 28. When selecting the 4 pad spots in wall or table setup mode, also allow walking up and touching the surface with the hand - the same two-collider mechanism as the pad buttons: highlight when the hand gets close, select when touching it. Ray/pinch selection stays available.
- [ ] 29. MR achievement for playing standing at walls, or on a mixed wall+table layout.
- [ ] 30. Research: can the SDK track how much a player moves (fitness-style) in wall or mixed wall+table modes? If not, estimate from the distances between the placed pads. For later score use; no health or calorie claims.
- [ ] 31. Store item: unlock another voice tied to story mode.
- [ ] 32. Special colored pads: the two new pads would have special effects - one could give double score when pressed (tentative example); the other pad's effect still to be decided.
- [ ] 33. Research: modifiers in incremental/clicker games; and whether a game has transformed Simon-style sequence-memory mechanics the way Balatro transformed poker.
- [ ] 34. Consider making the repo private again and moving preview/production hosting to a Cloudflare Worker - only if the Devpost competition rules allow it (verify rules first).

## In progress

- [ ] 9. Fade button transitions between lit and dim states in both directions.
- [ ] 10. Add a skip dialog button.

## Done

- [x] 20. In mixed reality, investigate whether the boundary can be ignored. Resolved in PR #28 (merged 2026-11-07): the MR session now requests an unbounded reference space with local-floor fallback; the user verified the boundary no longer appears on his headset.

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
