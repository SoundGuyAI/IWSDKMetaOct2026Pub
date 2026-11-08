# Wall Tones progress

Personal backlog for what still needs work — not an agent task list. Move items between sections as you go. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. After each PR merges or its review state changes, update this file the same day (owner rule, 2026-11-08). Times are Asia/Jerusalem.

## Not started

- [ ] 1. Setup window: bigger threshold angle to jump back into view
- [ ] 2. Setup window: after mode is selected, place it a little farther away, a little higher, and make it draggable
- [ ] 3. Bug: first box in the pattern is not blinking in VR (arrow also not showing)
- [ ] 4. Allow clicking the button with a ray
- [ ] 5. Sports mode that disables ray button clicks
- [ ] 6. Animation and juice
- [ ] 7. Wrist band that shows the buttons playing the pattern
- [ ] 8. Incremental features (park smaller follow-ups here as they come up)

### Store and pattern-row ideas - November 7 (backlog only, not implementation approval)
   - [ ] 35. Store modifier: speed up the part of the pattern already revealed by hints.
   - [ ] 36. Store item: index indicator showing where the player clicked in the pattern.
   - [ ] 37. Consider reworking the Listen line: reveal one note at a time instead of showing the whole pattern; also offer this as a store modifier purchasable before hints.
   - [ ] 38. Achievement screen rework: compact icon grid with a level number per achievement; unachieved entries greyed out; an explanation tooltip per achievement - tap pop-up on phone, gaze or ray in VR.
   - [ ] 39. Progressive achievements: do not cap levels at the current 5; keep leveling open-ended (threshold growth formula still to be decided with the user).

### Future ideas - November 6,18:02 (backlog only, not implementation approval)
   - [ ] 11a. Add player-applied multipliers to the scoring system; mechanics unspecified.
   - [ ] 12b. Auto-presser modifier.
   - [ ] 12c. Two more colored pads. In VR, the player would need to add them.
- [ ] 13. Secret unlock: brainstorm what it should be.
- [ ] 14. Story mode, told through the narrator. Open question: unlock it through the secret?
- [ ] 15. New trailer hinting that this is an ARG game.
- [ ] 16. Something flies out of the walls in MR after certain scores; in flat mode it flies into the screen, with a button to look at it. Details to brainstorm.
- [ ] 17. Rickroll fanfare. Open question: how many buttons does it need, and are 6 enough?

### MR and menu polish - November 6

- [ ] 22. In the game menu, make the window draggable by default; remove the top button's drag-mode toggle.
- [ ] 29. MR achievement for playing standing at walls, or on a mixed wall+table layout.
- [ ] 30. Research: can the SDK track how much a player moves (fitness-style) in wall or mixed wall+table modes? If not, estimate from the distances between the placed pads. For later score use; no health or calorie claims.
- [ ] 31. Store item: unlock another voice tied to story mode.
- [ ] 32. Special colored pads: the two new pads would have special effects - one could give double score when pressed (tentative example); the other pad's effect still to be decided.
- [ ] 33. Research: modifiers in incremental/clicker games; and whether a game has transformed Simon-style sequence-memory mechanics the way Balatro transformed poker.
- [ ] 34. Consider making the repo private again and moving preview/production hosting to a Cloudflare Worker - only if the Devpost competition rules allow it (verify rules first).
- [ ] 41. Achievement VO narration when the achievements panel is opened (requested 2026-11-07): new recorded voice lines in both voices, first-time/once-ever gating; design together with the achievement grid rework (item 38).
- [ ] 42. MR setup voice (reported Nov 7): the "Wall Tones can use your real-world environment" line plays twice when opening the setup window - it should play once. Reproduce first to confirm where the second play comes from.
- [ ] 43. MR air-place setup voice (requested Nov 7): before "Pad one of four", first explain the two placement orientations (upright / flat) like the earlier flow did, then say to pinch to place pad 1. The current flow skips the orientation explanation.
- [ ] 44. Store rework as RPG skill tree (requested Nov 7): items unlock in a fixed purchase order - a new Listen store item (about 30 Bars) must be bought before the Hint becomes available; hint prices change from 10/15/22 to 25, 50, 100, ... doubling. Refines item 37. Open question for the user before implementation: what the paid Listen item means now that the Listen phase reveals squares progressively for free (PR #29) - do not gate the existing free playback silently.

## In progress

- [~] 20. Boundary investigation: PR #28 (Nov 7) shipped an unbounded tracking space; whether the Quest boundary stays hidden in MR still needs on-headset confirmation.
- [~] 21. PR #43 open - head-locked MR subtitles at the bottom of the view; CI green, ready for on-device test (2026-11-08).
- [~] 23. PR #44 open - hide scoring during setup, show during the game loop; CI green, ready for on-device test (2026-11-08).
- [~] 25. PR #38 open - ray-aware setup panel; user requested changes 2026-11-08 (main menu must sit at eye level, not above the ceiling; panel only dodges upward when aiming at a selectable placement placeholder).
- [~] 26. PR #37 open - table pad shrink 25x25 to 20x20; placement fix (pad yaw, floor detection) in progress 2026-11-08.
- [~] 27. PR #41 open - combined walls + tables mode; CI green but shares the pre-fix table placement bugs (2026-11-08).
- [~] 28. PR #40 open - walk-up touch selection; user tested good 2026-11-08, tweaks in progress (touch-first voice line, purple selected placeholder).
- [~] 11. Score that grows exponentially with streak length (economy PR; PENDING the user's score-interpretation answer - Bars and streak persist meanwhile, no score display yet).
- [~] 12. Store where players buy modifiers (economy PR: gold Bars, hint store).
   - [~] 12a. Your Turn hint modifier: each level gives 5 boxes of hints; buy upgrades for longer hints (economy PR: 10/15/22 Bars then ~1.3x growth, open-ended, tunable; persistent unlocks; Your Turn row hidden without a hint, per user November 7).
- [~] 18. Save score, streak and settings locally (economy PR: best streak, Bars, hints, achievements, first-time flags persist; score persists once 11 lands).
- [~] 19. Achievements for streak, score, story and other milestones (economy PR: streak/Bar/store achievements, visual-only; score achievements once 11 lands).

## Done

- [x] 9. Fade button transitions between lit and dim states in both directions (pad-glow cross-fade; verified on main 2026-11-08).
- [x] 10. Skip button for voice lines, bottom-right on phone and desktop (verified on main 2026-11-08).
- [x] 24. Scan data shown with rescan option before play-mode selection (PR #39, merged 2026-11-08).
- [x] 40. "A game by Oded Sharon, Corbomite Games" credit under Settings in the main menu (PR #36, merged 2026-11-08); repo proprietary notice in README/NOTICE.

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

- **2026-11-08 (Asia/Jerusalem):** Owner rule: after each PR merges or its review state changes, update this file the same day - move finished items to Done, mark active ones in progress. Audited on this date: items 9, 10, 24 and 40 marked done; items 20, 21, 23, 25, 26, 27 and 28 reflect their open PRs.

- **2026-11-06 (Asia/Jerusalem):** Moved the future ideas and polish lists in from `todo.md` at the owner's request.

- **2026-11-03 (Asia/Jerusalem):** Desktop round verified in the managed browser (screenshot + recording). Quest passthrough, plane placement, anchors, and live fingertip hits were not run in this session — no headset attached to the cloud agent. Use the dev tunnel URL on a Quest to validate AR setup.
- **2026-11-03 (Asia/Jerusalem):** Fixed flat/desktop pad placement (camera-relative grid; was spawning under the floor at player origin). Automated flat play reached **best streak 10** via `scripts/wall-tones-streak-10.mjs`.
- **2026-11-03 (Asia/Jerusalem):** Fixed Quest/browser audio (unlock Web Audio on menu + first pad tap) and flat start (pads were ignored until tap-to-start). Moved/shrank HUD and enlarged pad hit boxes so all four grid pads are reachable.
- **2026-11-03 (Asia/Jerusalem):** Quieter voice (streak praise every 5 only); stronger pad tones (pointerdown audio priming + HTML WAV fallback).
- **2026-11-03 (Asia/Jerusalem):** Air placement no longer sticks a solid pad on the face — ghost follows the hand as a hollow outline, stays ≥ ~0.7 m from the eyes, uses smaller sitting pads, and solidifies on pinch.
