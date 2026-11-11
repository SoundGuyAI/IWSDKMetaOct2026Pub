# Wall Tones progress

Personal backlog for what still needs work — not an agent task list. Move items between sections as you go. Mark an item `in progress` when it starts and `done` when it meets the acceptance line in [WALL_TONES_PLAN.md](WALL_TONES_PLAN.md). Add a dated note for anything blocked or deliberately deferred. After each PR merges or its review state changes, update this file the same day (owner rule, 2026-11-08). Times are Asia/Jerusalem.

## Current status - November 11, 09:11 Asia/Jerusalem

Oded tested the merged main build and reported that everything looks fine. The accepted build is `b2fa4600da7482496ba3b5d879c0d406e001ae09`; its final complete CI passed all 48 end-to-end tests and 51 unit tests, typecheck, build and spec coverage: https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/actions/runs/42935989499 .

`CloudFlareProd` is the promotion branch from that exact tested main for Oded to configure in Cloudflare himself. Branch creation does not change Cloudflare configuration. New gameplay work waits for his backlog review and selection.

## Not started

- [ ] 3. Bug: first box in the pattern is not blinking in VR (arrow also not showing)
- [ ] 58. Bug: going from a game to the main menu drops out of XR back to the browser for a few seconds, and when you go back to the game all the scene data is lost and rescanning does not reload it (reported by Oded 2026-11-12 00:30, verbatim: "there's a bug that when you go from game to main menu - the XR leaves the XR and goes back to bworswer for a few seconds and aftewards when you go back o the game it loses all the scene data and rescanning doesn't reload it."). Observed sequence only; cause not investigated yet.
- [ ] 4. Ray interaction on the startup main menu (owner answered Nov 11 that the startup menu is the one failing). PR A: hidden panels no longer stay ray-targetable, which is a hypothesis for the cause, and the menu now follows the player closer (see 47). Needs a headset test to confirm; not confirmed as the root cause.
- [ ] 6. Animation and juice
- [ ] 8. Incremental features (park smaller follow-ups here as they come up)

### Store and pattern-row ideas - November 7 (backlog only, not implementation approval)
   - [ ] 35. Store modifier: speed up the part of the pattern already revealed by hints.
   - [ ] 36. Store item: index indicator showing where the player clicked in the pattern.
   - [ ] 37. Consider reworking the Listen line: reveal one note at a time instead of showing the whole pattern; also offer this as a store modifier purchasable before hints.
   - [ ] 31. Store item: unlock another voice tied to story mode.
   - [ ] 32. Special colored pads: the two new pads would have special effects - one could give double score when pressed (tentative example); the other pad's effect still to be decided.
   - [ ] 44. Store rework as RPG skill tree (requested Nov 7; updated with Oded's 2026-11-11 decisions). Structure settled 11:09: a skill tree with levels inside each category and "reach level X to unlock" gates between categories; tree mockup and square line glyph style approved. Settled items and test values (approved 18:30 as starting balance for testing, not final): Listen store item 30 Bars bought once - his rule: "Listen without it you don't have the listen line. If you have it you have the listen line but no hints." (the listen line = the progressive reveal row during Listen playback; Hint adds its own Your-Turn-side help; this supersedes the earlier note about not gating the free reveal - gating it behind the item is his instruction). Autoplay: each level auto-plays the first N notes in increments of 5 (level 1 = 5 notes, level 2 = 10, ...); test prices 12 / 30 / 65 / 130 Bars then doubling. Hint prices change from 10/15/22 to 25, 50, 100, ... doubling. Earned Replays: earned when you complete a pattern 5 notes beyond your current Hint coverage; kept in inventory after failure, capped at 2 (test values). Refines item 37. Update 22:07 (Oded, verbatim): "you can buy replayes at the store, free ones, only 2 max, but you get them every, i donno what i saif before. 5 i guess. yeah." - free Replays are earned at every 5-note milestone, capped at 2 held, and Replays are also purchasable in the store. Update 23:18 (Oded, verbatim): "The order should be - Listen -> Hint L1 -> Autoplay unlocks after Hint L4. don't have prerequisites for now: Replay Saver. add room for more like - the 5th and 6 buttons. The Act 3 narrator hack so they are on our side. Multiplier modifier (where you get double score). Speed modifier where some of the beginning pattern bars play faster." - the unlock order is Listen, then Hint level 1, then Autoplay once Hint reaches level 4; Replay and Saver have no prerequisites for now; the tree layout must leave room for future rows: the 5th and 6th pads (item 12c), the Act 3 narrator hack joining our side (Cypher story, item 14), a double-score multiplier modifier (see item 32) and a speed modifier where some of the beginning pattern bars play faster (distinct from item 35, which speeds the hint-revealed part). Update 23:21 (Oded, verbatim, answering the pricing questions): "1 ok. 20. / 2. 2 free. paid on top of that. / 3. for now no limit. maybe in the futuer. / 4. lose / 5. sure, you can use the same ?value you did with the test for the achivements." - paid Replays cost 20 Bars; the cap of 2 counts free Replays only, paid ones sit on top; no purchase limit for now; a free Replay granted while at the cap is lost; and the preview gets a 100-Bars test balance behind a URL ?value flag like the achievements demo. Update 2026-11-12: implementation in PR #69 (open, not merged - stale-label and economy fixes, CI and preview checks pending; the Saver from PR #63 still has to be wired in).

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
- [ ] 51. Cypher ARG story mode (requested 2026-11-11; implementation in PR #64 by the story worker). Static and radio-squawk sounds break in after a few rounds following a 5-pattern streak; his opening lines (verbatim): "connection.... established..", "Can you hear me? You're doing great. I'll explain In the next communication window", "Yes, Keep playing. they don't' suspect anything.. good", "Get a streak of 10 and above. So i can send a longer message." Act structure (21:54-21:55): Act 1 sticks close to his proposed lines and the narrator CANNOT hear Cypher (Cypher says they circumvented the game AI's security protocols so it can't detect them; the game apologizes for glitches and encourages continuing); Act 2 is a bigger discovery story between narrator and Cypher; Act 3 they all work together with the player to bring the terrorists down and it ends at a streak of 1024. Timing (23:2x): start after a 5 streak, then a few during further patterns, then after milestones like a 10 streak; the game should play out like the act-1 audio drama video with all its sound effects. Story-based hidden achievements too, e.g. for defeating the drones (21:56). Cracks with lights appear on the desktop page (and on MR walls) and disappear when a pattern is finished; in MR a drone can appear from above while looking down and breaks into parts on the floor when disabled. Two Cypher voice sets, male and female, each playing opposite the selected narrator's gender (23:15). Earlier script kept as backup for inspiration. Update 2026-11-12: implementation by the story worker (draft PR #70, not ready); all 57 voice clips (Cypher male/female 19 each, narrator 7 each, 5 effects) are published on branch cypher-upload-test and SHA-256-verified against the source recordings. Not merged.
- [ ] 52. Player yes/no and gesture input detection PR, after Cypher lands (requested 2026-11-11 21:13, Oded: "add another item todo list to add a PR to check if we can detect yes / no after we add cypher"). Covers voice input (recognize the player saying simple yes/no), head nods and headshakes, and - 21:56 (Oded, verbatim): "in the head nod PR/todo item also explore thumbs up / down detection". Update 2026-11-12 00:34 (Oded): start now, no need to wait for Cypher - two separate research PRs, each with its own main-menu test entry: a nod/shake yes/no lab and a thumbs up/down lab, each giving the player a scenario in Cypher's voice, detecting the answer, repeating it back ("what you did (yes/no)") and branching the dialogue. In preparation, not ready.
- [ ] 60. Narrator failure lines: failing a pattern must NOT trigger congratulatory narrator lines - the narrator should say something to comfort the player instead (requested by Oded 2026-11-12 01:23, verbatim: "add to todo - when failing the pattern the narrator should not say any congratolation lines. but something to comfort you. we can review all the lines we say and i can tell you which ones aren't the ones"). Follow-up example from him (01:23, verbatim): 'like it can say "Clean"' - recorded as a line to inspect, likely an example of a misfit success line on failure; NOT settled as the approved comforting replacement. Two parts: (a) fix failure-path line selection so no congratulatory line plays on failure; (b) a later full review of ALL spoken lines with Oded where he flags which ones do not fit. Backlog and review request only - not approval to rewrite or regenerate all audio now.
- [ ] 61. Cypher Act 1 light patches (requested by Oded 2026-11-12 01:38, then corrected 01:39: "add this addition to a todo" - BACKLOG ONLY, not for implementation now; the current PR #70 preview does NOT do this). Verbatim request: "in 70, after we reached 15 and she says something about patch of light, every time you complete a pattern another patch of light appears somethwere on screen , and stay on the screen until we reach 20. they they should all diisappear in a some fancy shader lit graphics.  they persist even through failures. and increase but no more than 20 of them on screen or MR. in MR they are appearing on walls yeah?" Details as requested: after the streak-15 "patch of light" dialogue, each completed pattern adds one patch of light; patches stay until streak 20, persist through failures, capped at 20 on screen; at 20 they all disappear in a fancy shader-lit graphics effect. In MR the patches should appear on walls (his target; wall-anchoring capability not yet verified). Grounding from the story worker (2026-11-12 01:39): the actual C15 line is "You might see a line of light"; the current seam visual is gated at 15 and closes on the next pattern; today's MR seam placement is camera-relative, NOT wall-anchored (XR vertical wall planes exist and are available for a future wall-anchored version - wall placement needs design, including the fallback when no wall plane is found). Timing conflict to resolve with Oded later: C16 says "Finish next pattern. That should close it" and N04/N05 close immediately, which conflicts with his persist-until-20 request - a future timing decision, recorded here; do NOT automatically change the lines or timing.
- [ ] 62. Cypher background dialogue lines (requested by Oded 2026-11-12 01:43, verbatim: "after the merge let's add another PR from the merged main where we add some more backgroun story lines where cypher describes more of her worlld these would pay like the rest of her lines but they would play every 2 parretn completions  if the narrator isn't saying anything. \n\nmake a list of varsious dialog lines that describes the world she's in. her mission. why she's doing this. who the terrorists are and what is on stake. give me a file to review . add this also to todo and we do this also after i approve. \n\nalso , we can discuss act 2 tomorrow."). Scope: new background lines where Cypher describes her world, her mission, why she is doing this, who the terrorists are and what is at stake; they play like the rest of her lines, every 2 pattern completions when the narrator is not saying anything. Process he set: (1) a PRIVATE review file with the proposed lines for his approval (story worker preparing it); (2) a separate PR cut from main AFTER PR #70 merges; (3) code and audio only after he approves the lines. New lore in the review file is a proposal, not established canon. Act 2 discussion is for tomorrow, not now.
- [ ] 63. Desktop keyboard voice skip: pressing the . (period) key skips the current voice line (requested by Oded 2026-11-12 01:50, verbatim: "add to todo - on desktop, pressing the . key  skips  a voice line"). Backlog only, not implemented.

### MR and menu polish - November 6

- [ ] 5. Sports mode that disables ray button clicks
- [ ] 7. Wrist band that shows the buttons playing the pattern
- [ ] 50. Air-placed pad colours must match the fanfare note order. Verified mapping on main: pads are id0 green 330Hz, id1 red 392Hz, id2 blue 587Hz, id3 yellow 494Hz; air placement places 1/2/3/4 = green, red, blue, yellow; the startup fanfare plays green, red, yellow, blue (ascending pitch, Oded's explicit Nov 5 design). Decision 2026-11-12 00:41 (Oded, verbatim): "B. i want the fanfare order to stay as it is right now (also becuas it looks better htis way in flat)" - the fanfare and melody stay as they are, and the air placement changes to green, red, yellow, blue to match it. This supersedes the literal "pads 1/2/3/4 = G R B Y" reading. Being amended in PR #68, not merged.
- [ ] 59. MR achievements ray polish: on the low row the ray can block the view of an achievement's logo (reported by Oded 2026-11-12 00:43, verbatim: "need to polish the ray on achivements on MR. when you're in the low row it kind blocks the view of the logo of the avehiment."). Observed behavior only; fix not designed yet.

### Visual mockups - November 11 (after backlog review)

- [ ] 48. Achievement screen mockup with icons, extending item 38. Produce after Oded reviews the list; do not implement the screen yet.
- [x] 49. Store mockup as a visual icon progression tree, like skill development. DONE 2026-11-11: skill-tree mockup with levels inside each category and "reach level X to unlock" gates between categories; square line glyph style approved by Oded. Remaining purchase/unlock numbers are tracked in item 44 (still open).
- [ ] 54. Achievement unlock needs more flare (requested 2026-11-11 23:13, Oded): on desktop and mobile a big pop-up in the middle of the screen "with juicy polished flashy animation with glow and fades and shares and what not", then it animates into the achievement button; in MR similar but as a billboarded thing in front of you; perhaps in both not just a flat "Achievement unlocked" but something more 3D. Update 2026-11-12: interactive prototype (flat and MR billboard mock) delivered for Oded's review before any cross-platform implementation; not a game implementation or headset test.
- [ ] 55. Consider renaming the currency from Gold Bars to Note Bars or Wall Bars (raised by Oded 2026-11-11 23:13). Consideration only, not a decided rename.
- [ ] 56. Consider renaming the Store and all the voices around it to "Modifiers" (raised by Oded 2026-11-11 23:15); can be done in the same PR as the skill tree (item 44). Tentative, not a decided rename.

### Remaining MR polish

- [ ] 29. MR achievement for playing standing at walls, or on a mixed wall+table layout.
- [ ] 30. Research: can the SDK track how much a player moves (fitness-style) in wall or mixed wall+table modes? If not, estimate from the distances between the placed pads. For later score use; no health or calorie claims. Update 2026-11-12 00:34 (Oded): start the movement-tracking research PR now. In preparation, not ready.
## In progress




- [~] 20. Boundary investigation: PR #28 (Nov 7) shipped an unbounded tracking space; whether the Quest boundary stays hidden in MR still needs on-headset confirmation.
- [~] 11. Score that grows exponentially with streak length (economy PR; PENDING the user's score-interpretation answer - Bars and streak persist meanwhile, no score display yet).
- [~] 12. Store where players buy modifiers (economy PR: gold Bars, hint store). Update 2026-11-12: being reworked as the skill tree (item 44) in PR #69, open and not merged.
   - [~] 12a. Your Turn hint modifier: each level gives 5 boxes of hints; buy upgrades for longer hints (economy PR: 10/15/22 Bars then ~1.3x growth, open-ended, tunable; persistent unlocks; Your Turn row hidden without a hint, per user November 7).
## Done

- [x] 45. "Streak saver" modifier "when you lost" (requested 2026-11-09). Backlog only; exact behavior and cost are not specified yet. Update 2026-11-11: PR #63 implements the Game Over saver flow (unmerged); 23:13 (Oded): pressing 3 times to save a streak was too cumbersome - now one button buys the saver and applies it immediately, no confirm, with the Bars icon on the button so the cost is obvious. 23:34 (Oded, verbatim): "yes. but all" - one press buys ALL missing saver units for the current streak (higher streaks can need more than one unit) and retries immediately. Shipped in PR #63 (merged 2026-11-12 00:44, merge commit 00d83b7, on Oded's 00:43:51 "i think we can merge 63"); the complete CI run 43111648211 passed on the exact merged code (build, typecheck, all three e2e shards; 53 unit tests). iPhone/headset feel and audio remain his to judge when he next plays.

- [x] 53. Ray and gaze+pinch pad presses during gameplay (requested 2026-11-11 22:04, Oded: "add another PR in which you to the task that a ray and gaze/pinch can also be used to press a tone button during gameplay"). IMPLEMENTED in PR #65 (merged 23:46, merge commit 2d50a96, on Oded's 23:45 "ready to merge."): play pads are ray-interactable (controller or hand ray hover + pinch), plus a head-forward gaze ray with either-hand pinch commit; fingertip touch unchanged; pinches aimed at the game panel still belong to the panel. Verified: local typecheck, 53 unit tests and build pass; preview loads and plays on desktop; pushed files match local. NOT verified: the ray and gaze presses on a real headset (Oded's Quest check). Update 23:13 (Oded): "the collider for the ray needs to be different than the one for the touch. it should only be a little bit bigger than the button itseld but not a huge box like the hand touch one." - implemented the same evening: fingertip volumes no longer answer raycasts; rays hit a tight invisible box at 1.1x pad size. Pushed to PR #65 and merged 23:46.

- [x] 38. Achievement screen rework: compact icon grid with a level number per achievement; unachieved entries greyed out; an explanation tooltip per achievement - tap pop-up on phone, gaze or ray in VR. Shipped in PR #61 (merged 23:14): 3x2 grid of filled coloured square tiles with white line glyphs, a level badge and a one-word name under each (locked ones are the glyph alone in a dimmed category colour), details in a floating pop-up (follows the mouse, ray-point in MR, tap switches on phone), and an internal scroll area when there are more than 6 tiles while the window height stays fixed. Oded asked on 2026-11-11 for the look to match the earlier mockup; the locked-tile look is a proposal he has not confirmed. Preview-only sample view: add ?demoAchievements=1 (or =many for scroll testing) to the preview URL; it changes only what the screen draws, saves nothing. The item 29 standing achievement and the item 48 mockup are not part of it.

- [x] 39. Progressive achievements: do not cap levels at the current 5; keep leveling open-ended (threshold growth formula still to be decided with the user). Shipped in PR #61 (merged 23:14): after the listed thresholds each numeric category keeps leveling on 10/25/50/100 per decade (100, 250, 500, 1000, 2500, ...); existing thresholds unchanged; Secret stays one level. The pattern was accepted by Oded for now, not as a final formula.

- [x] 41. Achievement VO narration (requested 2026-11-07). IMPLEMENTED in PR #61 (merged 23:14): six new recorded lines (male Puck and female Laomedeia, for PC, iPhone and MR), approved wording, played once ever the first time the Achievements board opens (localStorage wall-tones-achievements-intro-played), respecting Voices off (skips without marking) and Skip voice. Verified: transcripts match the approved wording; unit tests; local browser check on desktop (plays once, not on reopen, silent and unmarked with voices off). NOT verified: nobody has listened to the clips; headset (MR) and iPhone listening and level check pending.

- [x] 46. Debug colliders toggle moved from the in-game panel to the main menu Settings (owner Nov 11, replaces 'remove before launch'). Hidden on flat/desktop. Shipped in PR #60 (merged 2026-11-11 22:06 on Oded's 22:04 go-ahead); the on-headset confirmation is still pending.

- [x] 47. MR startup MAIN MENU follow (reported Nov 11): in XR the panel now follows the player with the in-game panel's distance, height offset, scale and look-away rule. Shipped in PR #60 (merged 2026-11-11 22:06 on Oded's 22:04 go-ahead); the on-headset confirmation is still pending.

- [x] 18. Save score, streak and settings locally (live on main: best streak, Bars, hints, achievements and first-time flags persist; score persists once 11 lands).

- [x] 19. Achievements for streak, score, story and other milestones (shipped in PR #61, merged 23:14: streak/Bar/store achievements, visual-only; score achievements once 11 lands).

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

## Review update - 2026-11-11, 23:25 Asia/Jerusalem

- PR #60 (startup menu, Debug colliders) merged 22:06 and PR #61 (achievements grid, pop-ups, spoken intro) merged 23:14, each on Oded's explicit go-ahead ("PR 60 . you can merge." 22:04; "61 can merge" 23:13). Main is 47888e9. PR #63 (Game Over popup) and PR #65 (ray/gaze+pinch pads) were updated the same evening from his 23:13 feedback (items 45 and 53) and await his go-ahead; he has not merged them. The GitHub Pages deploy verify step failed on the post-PR60 run and is being re-checked; CloudFlareProd and the Cloudflare configuration are unchanged.
- Update 23:46: the post-PR61 main run 43101309906 verified GitHub Pages live on main 47888e9. PR #65 merged 23:46 (merge commit 2d50a96) on Oded's 23:45 "ready to merge." PR #63 still awaits his go-ahead.

## Review update - 2026-11-12, 00:15 Asia/Jerusalem

- PR #65 merged 23:46 (merge commit 2d50a96) and PR #67 merged 23:50 (merge commit 07430cf), each on Oded's explicit go-ahead (23:45 "ready to merge."; 23:47 conditional approval whose condition was met). PR #67 was the backlog-file edit itself: dated log entries now live in bottom "Review update" sections.
- PR #63 (Game Over saver) advanced to head 9899b801: one press buys ALL missing saver units and retries (Oded 23:34 "yes. but all"), the stale e2e spec was rewritten to the one-press flow with unaffordable / partial-inventory / multi-unit coverage, and visual proof was captured on the preview. Full CI dispatched (run 43109512240). NOT merged - awaits Oded's go-ahead.
- Per Oded 00:05/00:06: items 5, 7 and 50 moved to "MR and menu polish" (IDs preserved). Items 51 (Cypher ARG story spec) and 52 (yes/no voice, head nod/shake and thumbs up/down detection) added with the story worker's IDs. Stale "not merged" qualifiers corrected on items 38, 39, 41 and 53 (PR #61 merged 23:14; PR #65 merged 23:46). Moving finished items to Done waits for the done-audit after PR #63 merges (his conditional 00:05 instruction).
- CloudFlareProd and the Cloudflare configuration remain unchanged.

## Review update - 2026-11-12, 00:50 Asia/Jerusalem

- PR #63 merged 00:44 (merge commit 00d83b7) on Oded's 00:43:51 "i think we can merge 63". Before merging, main was verified unchanged at 943c59c5 - the exact base the complete green CI run 43111648211 had tested. Main is now 00d83b7.
- Done-audit (his conditional 00:05 instruction, now executable): items 45, 53, 38, 39, 41, 46, 47, 18 and 19 moved to Done. Items 46 and 47 shipped in PR #60 and still carry their pending on-headset confirmation; item 41 keeps its nobody-has-listened caveat; item 4 stays open because the ray fix is still an unconfirmed hypothesis.
- New items: 58 (XR-exit scene-loss bug, his 00:30 report) and 59 (MR achievements low-row ray polish, his 00:43 report), both recorded as observed behavior with no assumed cause.
- Item 50 resolved to option B by his 00:41 choice: the fanfare stays green/red/yellow/blue and the air placement changes to match it; the earlier literal G/R/B/Y reading is superseded. PR #68 is being amended accordingly, not merged.
- In preparation, none merged or ready: PR #69 (skill-tree store, item 44), PR #70 draft (Cypher story, item 51), the nod/shake and thumbs yes/no labs (item 52), the movement-tracking research PR (item 30) and the achievement-unlock animation prototype (item 54, ready for his review as a prototype only).
- Oded asked (00:44) that he test the updated main build before any Cloudflare publishing; CloudFlareProd and the Cloudflare configuration remain unchanged.

## Review update - 2026-11-12, 01:25 Asia/Jerusalem

- New item 60 (his 01:23 request, verbatim in the item): failing a pattern must not play congratulatory narrator lines; comforting lines instead, plus a later full review of all spoken lines where he flags the misfits. His follow-up example 'like it can say "Clean"' is recorded as a line to inspect, not a settled replacement.
- PR #68 failed his 01:19 headset test (blue before yellow in the MR fanfare with a wrong sound, ray presses on the vertical air pads not registering, yellow press blinking blue) and is being reviewed and redone; not merged. Item 50 stays resolved to option B - the fanfare and flat layout unchanged, air placement matching them.
## Review update - 2026-11-12, 01:40 Asia/Jerusalem

- New item 61 (his 01:38 request, corrected 01:39 to backlog-only: "add this addition to a todo"): Cypher Act 1 light patches - one patch per completed pattern after the streak-15 dialogue, persisting through failures, capped at 20, all vanishing in a shader-lit effect at streak 20; MR wall placement desired (today's MR seam is camera-relative, not wall-anchored; vertical wall planes exist for a future version, wall fallback needs design). C16/N04/N05 closure timing conflicts with persist-until-20 - unresolved, no automatic line or timing changes. Not implemented; not part of the current PR #70 preview.
- PR #70 audio fix deployed on the branch at 5dff4aa (PR-owning agent verified the deployed build, not a user approval): 11 quiet voice clips level-repaired, all 11 remote preview hashes verified, CI and preview green, audio only - no source or progress-code changes.
## Review update - 2026-11-12, 01:45 Asia/Jerusalem

- New item 62 (his 01:43 request, verbatim in the item): Cypher background dialogue lines (world, mission, motive, terrorists, stakes), playing every 2 pattern completions when the narrator is quiet. His process: review file first, then a separate PR from main after PR #70 merges, code/audio only after he approves the lines. Act 2 discussion deferred to tomorrow by him. Backlog only - no implementation started.
## Review update - 2026-11-12, 01:52 Asia/Jerusalem

- New item 63 (his 01:50 request, verbatim in the item): on desktop, the . (period) key should skip the current voice line. Backlog only.
