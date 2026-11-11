# Wall Tones progress

Personal backlog for what still needs work — not an agent task list. Move items between sections as you go. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. After each PR merges or its review state changes, update this file the same day (owner rule, 2026-11-08). Times are Asia/Jerusalem.

## Current status - November 11, 09:11 Asia/Jerusalem

Oded tested the merged main build and reported that everything looks fine. The accepted build is `b2fa4600da7482496ba3b5d879c0d406e001ae09`; its final complete CI passed all 48 end-to-end tests and 51 unit tests, typecheck, build and spec coverage: https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42935989499 .

`CloudFlareProd` is the promotion branch from that exact tested main for Oded to configure in Cloudflare himself. Branch creation does not change Cloudflare configuration. New gameplay work waits for his backlog review and selection.

## Not started

- [ ] 3. Bug: first box in the pattern is not blinking in VR (arrow also not showing)
- [ ] 4. Ray interaction on the startup main menu (owner answered Nov 11 that the startup menu is the one failing). PR A: hidden panels no longer stay ray-targetable, which is a hypothesis for the cause, and the menu now follows the player closer (see 47). Needs a headset test to confirm; not confirmed as the root cause.
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
   - [ ] 31. Store item: unlock another voice tied to story mode.
   - [ ] 32. Special colored pads: the two new pads would have special effects - one could give double score when pressed (tentative example); the other pad's effect still to be decided.
   - [ ] 44. Store rework as RPG skill tree (requested Nov 7): items unlock in a fixed purchase order - a new Listen store item (about 30 Bars) must be bought before the Hint becomes available; hint prices change from 10/15/22 to 25, 50, 100, ... doubling. Refines item 37. Open question for the user before implementation: what the paid Listen item means now that the Listen phase reveals squares progressively for free (PR #29) - do not gate the existing free playback silently.

   - [ ] 45. "Streak saver" modifier "when you lost" (requested 2026-11-09). Backlog only; exact behavior and cost are not specified yet.

### Future ideas - November 6,18:02 (backlog only, not implementation approval)
   - [ ] 11a. Add player-applied multipliers to the scoring system; mechanics unspecified.
   - [ ] 12b. Auto-presser modifier.
   - [ ] 12c. Two more colored pads. In VR, the player would need to add them.
- [ ] 13. Secret unlock: brainstorm what it should be.
- [ ] 14. Story mode, told through the narrator. Open question: unlock it through the secret?
- [ ] 15. New trailer hinting that this is an ARG game.
- [ ] 16. Something flies out of the walls in MR after certain scores; in flat mode it flies into the screen, with a button to look at it. Details to brainstorm.
- [ ] 17. Rickroll fanfare. Open question: how many buttons does it need, and are 6 enough?
- [ ] 33. Research: modifiers in incremental/clicker games; and whether a game has transformed Simon-style sequence-memory mechanics the way Balatro transformed poker.
- [ ] 34. Consider making the repo private again and moving preview/production hosting to a Cloudflare Worker - only if the Devpost competition rules allow it (verify rules first).

### MR and menu polish - November 6

- [ ] 47. MR startup MAIN MENU follow (reported Nov 11): in XR the panel now follows the player with the in-game panel's distance, height offset, scale and look-away rule. PR A, awaiting headset test.

### Visual mockups - November 11 (after backlog review)

- [ ] 48. Achievement screen mockup with icons, extending item 38. Produce after Oded reviews the list; do not implement the screen yet.
- [ ] 49. Store mockup as a visual icon progression tree, like skill development. Extends item 44; mockup only, purchase/unlock rules remain undecided. Await backlog review before starting.

### Remaining MR polish

- [ ] 46. Debug colliders toggle moved from the in-game panel to the main menu Settings (owner Nov 11, replaces 'remove before launch'). Hidden on flat/desktop. PR A, awaiting headset test.

- [ ] 29. MR achievement for playing standing at walls, or on a mixed wall+table layout.
- [ ] 30. Research: can the SDK track how much a player moves (fitness-style) in wall or mixed wall+table modes? If not, estimate from the distances between the placed pads. For later score use; no health or calorie claims.
- [ ] 41. Achievement VO narration when the achievements panel is opened (requested 2026-11-07): new recorded voice lines in both voices, first-time/once-ever gating; design together with the achievement grid rework (item 38).

## In progress




- [~] 20. Boundary investigation: PR #28 (Nov 7) shipped an unbounded tracking space; whether the Quest boundary stays hidden in MR still needs on-headset confirmation.
- [~] 11. Score that grows exponentially with streak length (economy PR; PENDING the user's score-interpretation answer - Bars and streak persist meanwhile, no score display yet).
- [~] 12. Store where players buy modifiers (economy PR: gold Bars, hint store).
   - [~] 12a. Your Turn hint modifier: each level gives 5 boxes of hints; buy upgrades for longer hints (economy PR: 10/15/22 Bars then ~1.3x growth, open-ended, tunable; persistent unlocks; Your Turn row hidden without a hint, per user November 7).
- [~] 18. Save score, streak and settings locally (economy PR: best streak, Bars, hints, achievements, first-time flags persist; score persists once 11 lands).
- [~] 19. Achievements for streak, score, story and other milestones (economy PR: streak/Bar/store achievements, visual-only; score achievements once 11 lands).

## Done

- [x] 25. PR #38: raised/tilted setup panel, 50-degree horizontal follow, frozen snap, per-hand menu routing, front/adjacent safe wall placement and explicit header-only drag/drop. Gameplay pinches no longer reposition it. Owner-approved merge b97f623 at02:37:57 on11Nov; exact2126021 full48e2e+42units/type/build/coverage passed with current main050f3f1 included.
- [x] 27. PR #41: combined wall/table picking and approved combined guidance in both voices, preserving single-surface voices. Owner-approved merge5ea8050 at03:01 on11Nov. New mainb97f623 included before exact95e101d complete48e2e+51units/type/build/coverage passed in run42934467110. Size compatibility keeps real per-slot size first, with transform fallback. Owner reported the merged main test looked fine at09:11 on11Nov.
- [x] 1. Setup window: bigger threshold angle to jump back into view PR #38 merged 11 Nov as b97f623; Owner reported the merged main test looked fine at09:11 on11Nov.
- [x] 2. Setup window: after mode is selected, place it a little farther away, a little higher, and make it draggable PR #38 merged 11 Nov as b97f623; Owner reported the merged main test looked fine at09:11 on11Nov.
- [x] 22. In the game menu, make the window draggable by default; remove the top button's drag-mode toggle. PR #38 merged 11 Nov as b97f623; Owner reported the merged main test looked fine at09:11 on11Nov.
- [x] 42. MR setup voice (reported Nov 7): the "Wall Tones can use your real-world environment" line plays twice when opening the setup window - it should play once. Reproduce first to confirm where the second play comes from. PR #38 merged 11 Nov as b97f623; Owner reported the merged main test looked fine at09:11 on11Nov.
- [x] 43. MR air-place setup voice (requested Nov 7): before "Pad one of four", first explain the two placement orientations (upright / flat) like the earlier flow did, then say to pinch to place pad 1. The current flow skips the orientation explanation. PR #38 merged 11 Nov as b97f623; Owner reported the merged main test looked fine at09:11 on11Nov.

- [x] PR #47: deterministic automated pad-fade correction, owner-approved merge58ab5bf at00:53 on11Nov. Exact combined e796dde: full public e2e46/46,6units/typecheck/build/spec coverage passed. No gameplay change or new device acceptance claim.
- [x] PR #45: width-fit phone menu and phone Enter XR hiding, owner-approved mergebe38840 at01:04 on11Nov. Latest47main included; exact5e38de1 full public e2e46/46,8units/typecheck/build/spec coverage passed. Physical-device checks are separate.
- [x] 23. PR #44: explanation, scoring, Store and Achievements hidden during MR placement, restored at intro; flat unchanged. Owner-approved merge9afba20 at01:18 on11Nov. Latest45main included; exacte32f110 full public e2e48/48,9units/typecheck/build/spec coverage passed. Owner accepted the merged main test on11Nov at09:11.
- [x] 26. PR #37: independent per-table pad sizing, including25/20cm mixes, retained through hit-testing and final geometry. Owner-approved merge6319838 at01:31 on11Nov. Latest44main included; exact28f51cb full public e2e48/48,21units/typecheck/build/spec coverage passed. Owner accepted the merged main test on11Nov at09:11.

- [x] PR #46: desktop panel enlargement, owner-approved merge930df96 at20:56 on10Nov. Current main included before exact-head d72a076 full public e2e44/44 plus4units/typecheck/build/coverage passed; local typecheck/build and all7polish tests passed in bounded groups.
- [x] 28. PR #40: touch selection, walk-up/ray guidance, purple selected placeholder and approved voice clips. Owner-approved merge7808cdb at21:13 on10Nov. Latest main930df96 included; exact-head d2a83d9 full public e2e44/44 plus4units/typecheck/build/coverage passed; local combined checks passed.
- [x] 21. PR #43: head-locked caption text and voices-off subtitles. Owner-approved merge556d51e at21:26 on10Nov. Latest main7808cdb included; exact-head b3b8ecf full public e2e46/46 including slow and caption tests plus6units/typecheck/build/coverage passed; local combined checks passed. Owner accepted the merged main test on11Nov at09:11.

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

- **2026-11-08 (Asia/Jerusalem):** Owner moved items 31, 32 and 44 into Store and pattern-row ideas, and 33 and 34 into Future ideas (out of MR and menu polish).

- **2026-11-08 (Asia/Jerusalem):** Owner rule: after each PR merges or its review state changes, update this file the same day - move finished items to Done, mark active ones in progress. Audited on this date: items 9, 10, 24 and 40 marked done; items 20, 21, 23, 25, 26, 27 and 28 reflect their open PRs.

- **2026-11-06 (Asia/Jerusalem):** Moved the future ideas and polish lists in from `todo.md` at the owner's request.

- **2026-11-03 (Asia/Jerusalem):** Desktop round verified in the managed browser (screenshot + recording). Quest passthrough, plane placement, anchors, and live fingertip hits were not run in this session — no headset attached to the cloud agent. Use the dev tunnel URL on a Quest to validate AR setup.
- **2026-11-03 (Asia/Jerusalem):** Fixed flat/desktop pad placement (camera-relative grid; was spawning under the floor at player origin). Automated flat play reached **best streak 10** via `scripts/wall-tones-streak-10.mjs`.
- **2026-11-03 (Asia/Jerusalem):** Fixed Quest/browser audio (unlock Web Audio on menu + first pad tap) and flat start (pads were ignored until tap-to-start). Moved/shrank HUD and enlarged pad hit boxes so all four grid pads are reachable.
- **2026-11-03 (Asia/Jerusalem):** Quieter voice (streak praise every 5 only); stronger pad tones (pointerdown audio priming + HTML WAV fallback).
- **2026-11-03 (Asia/Jerusalem):** Air placement no longer sticks a solid pad on the face — ghost follows the hand as a hollow outline, stays ≥ ~0.7 m from the eyes, uses smaller sitting pads, and solidifies on pinch.

## Historical review update - 2026-11-10,21:26 Asia/Jerusalem

- Owner approved complete GitHub Actions verification instead of the interrupted long local suite for PR40/43/46, provided the repo remains public. Public status was verified. Full suites included all slow tests with no coverage cut. Interrupted local runs were not claimed as full passes.
- PR46,PR40,PR43 are now merged in order; each next branch included the newly advanced main and reran the complete suite before its merge. Main556d51e. No other feature merge was authorized or made.
- Review fixes37/38/44/45 remain unmerged as detailed above. Chinder is excluded from the testing guide. PR47 remains a separate, unmerged test-only proposal.
- Full runs: PR46 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42877355773 ; PR40 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42880591744 ; PR43 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42883266235 .

## Historical review update - 2026-11-11,01:32 Asia/Jerusalem

- Owner approved PR47,45,44,37 and complete public GitHub verification. All four merged in that order. Each branch included newly advanced main before combined-tree checks. Main6319838. Final main complete run is next after this documentation update, not yet claimed green.
- Full runs: PR47 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42917198854 ; PR45 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42918811513 ; PR44 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42920418211 ; PR37 https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42922486456 .
- PR38 new review feedback supersedes the prior ray-dodge approach: lower edge above head in air placement and above eyes for wall selection; tilt toward viewer,50degree horizontal follow threshold, frozen snap target, per-hand menu/placement routing and header drag. After wall/seated placement search front/adjacent wall space avoiding pads, never behind, floating fallback. Implemented locally with14targeted geometry/production-method tests and synthetic UIKit pixels/raycast checks. Latest main integrated locally; final integration/testing and preview push pending. No physical Quest acceptance or merge approval.
- PR41 requires one combined walls-and-tables prompt rather than two sequential announcements. Implementation and new recorded assets are in progress separately. No merge approval.
- Cloudflare production failure analysis and proposed CloudFlareProd promotion branch are pending. Main builds remain disabled by the owner; no account or deployment settings changed.

## Historical review update - 2026-11-11,03:02 Asia/Jerusalem

- Owner approved PR38 and PR41 at02:36:59. Both merged sequentially; PR41 included the newly advanced main and passed the complete public suite before its merge. Main5ea8050. No other feature PRs remain open.
- PR38 complete run: https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42929726303 . PR41 combined complete run: https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42934467110 . Full suites include all48e2e, not a synchronize-event skip. PR41 combined tree has51units.
- Final main full run follows this documentation update. Do not treat it as passed until that run finishes.
- Production gate: user will test main after the complete main CI passes, likely after the conference. Only after that test and his go-ahead can the production branch be opened. No CloudFlareProd branch or Cloudflare settings changes were made.
- The reported Cloudflare EMFILE failure was followed by successful builds. The investigation found the Vite config's UIKit icon import chain and descriptor-limit sensitivity; it did not establish an ongoing outage or justify an unrequested dependency/settings change.

## Review update - 2026-11-11,09:11 Asia/Jerusalem

- Oded tested main after the final complete CI pass and reported that everything looks fine. PRs38/41 and the earlier merged review fixes are finished; the new startup-main-menu follow issue is item47, not a reopened setup/gameplay panel task.
- Final accepted build: b2fa460. Complete main CI: https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42935989499 .
- Owner requested creation of CloudFlareProd from the tested main for his own Cloudflare setup. No Cloudflare settings, credentials or deployment action is part of this update.
- Ray button interaction (4), achievement icon mockup (48), and store icon progression-tree mockup (49) are captured for his list review. No new gameplay or mockup work has started. Older unresolved economy/score and boundary-specific questions remain open; general main acceptance is not a claim that each separate investigation was explicitly tested.
