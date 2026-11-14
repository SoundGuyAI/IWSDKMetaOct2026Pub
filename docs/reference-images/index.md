# Wall Tones reference images: index and Oded's comments

For coding agents working on Wall Tones 2: Too Fast to Wall.

How to read this file:
- Quotes are Oded's own WhatsApp words, verbatim, typos kept. Times are Israel time, 2026.
- Status: APPROVED = he approved it in reply to that image. PREFERRED = he picked it among options. REJECTED = he said it was wrong. FEEDBACK = a comment without a verdict. PROPOSED = we made it and he gave no verdict on that image. NO VERDICT RECORDED = same, for art not tied to a design decision.
- "Replied to" means the comment was a WhatsApp reply to that exact image. "Nearby" means sent close in time with no reply link, so the mapping is inferred.
- Concept art and mockups show direction only. Where an image and the live build differ, ask Oded before copying the image.
- Images that exist only as WhatsApp attachments we could not recover are listed in section 5 with their comments. No image was regenerated to replace them.

## Stored file names

The upload tool added a number prefix (`N-`) to every image file name. In this index, a file is listed without that prefix. Stored names:

| Name used in this index | Stored file name |
|---|---|
| rift-layout-pc.png | 1-rift-layout-pc.png |
| rift-concept-1c-hands-4color.png | 2-rift-concept-1c-hands-4color.png |
| rift-concept-2b-beam-4color.png | 3-rift-concept-2b-beam-4color.png |
| rift-concept-3-rifts-room.png | 4-rift-concept-3-rifts-room.png |
| rift-layout-mobile-tap.png | 5-rift-layout-mobile-tap.png |
| rift-layout-mobile-drag.png | 6-rift-layout-mobile-drag.png |
| rift-layout-mobile-scratch.png | 7-rift-layout-mobile-scratch.png |
| rift-style-a-glitch-static.png | 8-rift-style-a-glitch-static.png |
| rift-style-b-terminal-green.png | 9-rift-style-b-terminal-green.png |
| rift-style-c-waveform-slash.png | 10-rift-style-c-waveform-slash.png |
| rift-style-d-four-color.png | 11-rift-style-d-four-color.png |
| rift-style-e-light-crack.png | 12-rift-style-e-light-crack.png |
| rift-anim-f1-forming.png | 13-rift-anim-f1-forming.png |
| rift-anim-f2-widening.png | 14-rift-anim-f2-widening.png |
| rift-anim-f4-sealing.png | 15-rift-anim-f4-sealing.png |
| rift-anim-f5-sealed.png | 16-rift-anim-f5-sealed.png |
| rift-anim-pc-sealing.png | 17-rift-anim-pc-sealing.png |
| rift-anim-pc-sealed.png | 18-rift-anim-pc-sealed.png |
| rift-anim-mob-sealing.png | 19-rift-anim-mob-sealing.png |
| rift-anim-mob-sealed.png | 20-rift-anim-mob-sealed.png |
| rift-motion-mockup.gif | 21-rift-motion-mockup.gif |
| armband-a-20-notes.png | 22-armband-a-20-notes.png |
| armband-a-closeup.png | 23-armband-a-closeup.png |
| armband-projector-v1-rejected.png | 24-armband-projector-v1-rejected.png |
| armband-projector-v2.png | 25-armband-projector-v2.png |
| marketing-concept-1-room-is-the-board.png | 26-marketing-concept-1-room-is-the-board.png |
| marketing-concept-2-touch-the-tone.png | 27-marketing-concept-2-touch-the-tone.png |
| marketing-concept-3-follow-the-pattern.png | 28-marketing-concept-3-follow-the-pattern.png |
| marketing-concept-4-the-table-is-the-board.png | 29-marketing-concept-4-the-table-is-the-board.png |
| marketing-concept-5-tabletop-tones.png | 30-marketing-concept-5-tabletop-tones.png |
| marketing-concept-6-remember-the-melody.png | 31-marketing-concept-6-remember-the-melody.png |
| marketing-enhanced-glass-pads.png | 32-marketing-enhanced-glass-pads.png |
| marketing-g4c-key-image.png | 33-marketing-g4c-key-image.png |
| marketing-leaderboard-hero.png | 34-marketing-leaderboard-hero.png |
| marketing-thumbnail-gameplay.png | 35-marketing-thumbnail-gameplay.png |
| marketing-voice-script-hero.png | 36-marketing-voice-script-hero.png |
| ui-achievement-unlock-glow.png | 37-ui-achievement-unlock-glow.png |

Cleanup welcome: rename the files to drop the prefix (`git mv`) and delete this table.

## 1. Armband (wristband) and palm projector (Nov 13-14)

| File | What it is | Status and Oded's words |
|---|---|---|
| armband-a-20-notes.png | Armband concept A: chunky retro console. Mockup shows 6 placeholder buttons (Repeat, Play, Auto, Modifiers, Speed, x2). The approved implementation has 4 real controls: Repeat, Modifiers, Hint upgrade, Autoplay. | APPROVED (replied to, Nov 13 12:22): "I like a but note that the hint chain can be long. Like 20 or so. We shoud display the current relevant 20 (also in the main menu) if the chain is longer than 20." Original brief (12:09): "a functioning armband like Fallout pip boy or the thing Leela  has in futurama". |
| armband-a-closeup.png | Close-up of the A reference. | Reference for A, no separate comment. |
| armband-projector-v1-rejected.png | v1 sketch: projector opens above the flat palm, from the wrist. | REJECTED (replied to, Nov 14 00:50): "thsi looks terrible generate an image instead of this" and "also the projector shoud not coem from the wrist band but from the center of an open palm poitning upwards". |
| armband-projector-v2.png | v2 generated image, projection from the palm centre. | APPROVED direction (replied to, 00:54): "yes. the content of the panel needs to look exacatly like the mock up we did with the wrist band". Later: 01:15 "the panel needs to be billboarded sacing towards to you and not horizontal"; 01:16 "yeah flowting above you hand,  and ther should be some beam of light maybe from the center of your hand towards it. with a new  light ray shader and some light rays animations - like in the concept referecne image"; 01:17 "the panel should have and some movement stabilization , like not move straight away with the hand". |
| (voice note, Nov 14 00:11, transcript) | His Quest test of the built armband. | FEEDBACK: "it does not look like the concept reference and I'm not sure the buttons it has on it were in the concept reference ... The angle is not really aligned with my hand as much as it should be ... the shape of it and the content is mostly what I'm concerned about with the wristband." |

Armband concept B (slimmer cuff) was shown to him but was not chosen. Its image file was not recovered (section 5).

## 2. Rift sealing and hand energy (Nov 13-14)

| File | What it is | Status and Oded's words |
|---|---|---|
| rift-concept-1c-hands-4color.png | Revised: four-color notes around both hands. Replaces earlier versions 1b, 2, 4, 5, 6, which we do not hold. | PROPOSED. Brief (12:15): "for every successful note , other than good bars , my hands collect  some energy. Represented by both a glow, particles , and note particles orbiting and floating." Correction (replied to the earlier version, 12:20): "The notes should be in the 4 colors of the board . They should be orbiting both hands but in the visuals proninabtly the one firing". |
| rift-concept-2b-beam-4color.png | Revised open-palm beam, four-color notes, denser around the firing palm, no wristbands. | PROPOSED. Replied to (12:24): "Ok this this soemthing you'll be able to correctly implement ?" |
| rift-concept-3-rifts-room.png | Purple rifts in a home with a fantasy scene beyond. | FEEDBACK, not a plain rejection. Replied to (12:24): "Are we going with purple rifts? Perhaps the rifts would be a PR of their own after we do simple placeholder temp art ones . Give me more options for the rift colors and shapes and be inspired by what we know of the game and the hacker theme". At 14:50 he asked: "revise all the purple rifts in the images to be the colorful note ones". Whether this file was made before or after that request is unknown. Treat purple as superseded by the four-color style. |
| rift-layout-pc.png | PC layout over the real board. | APPROVED (replied to, 12:25): "Good". Also his note: "Pc there is enough screen space and the notes can circle the mouse pointer and then we can just click them." |
| rift-layout-mobile-drag.png | Mobile: drag energy to the rift. | APPROVED (replied to, 12:25): "Let's go with drag". |
| rift-layout-mobile-tap.png, rift-layout-mobile-scratch.png | Mobile tap and scratch layouts. | Not chosen. |
| rift-style-a-glitch-static.png | A. Signal intrusion, cyan/magenta. | Not chosen. |
| rift-style-b-terminal-green.png | B. Data breach, green code. | Not chosen. |
| rift-style-c-waveform-slash.png | C. Waveform tear. | Not chosen. |
| rift-style-d-four-color.png | D. Four-color fracture, edges match the board, note sparks. | PREFERRED (replied to, 12:27): "I like this one". Then (12:27): "It needs to be animated . Particles. Shaders. Glows. The works". |
| rift-style-e-light-crack.png | E. Thin light crack. | Not chosen. |
| rift-anim-f1-forming.png, rift-anim-f2-widening.png, rift-anim-f4-sealing.png, rift-anim-f5-sealed.png | Rift closing stages, frames 1, 2, 4, 5 (frame 3 not held). | See the motion mockup row. |
| rift-anim-pc-sealing.png, rift-anim-pc-sealed.png, rift-anim-mob-sealing.png, rift-anim-mob-sealed.png | PC and mobile sealing, before and after. | Same. |
| rift-motion-mockup.gif | Motion mockup: hand beam in MR, pointer energy on desktop, rift closing stages. | FEEDBACK (Nov 13 13:34): "good. i dont' liek teh shake. i was thinkoing more of the note particles would be animated as well as how the actions for the rift closgin will be. i like the stages of the rift closgin." On a later version (13:41): "the dots needs to be colorful notes. their origin is wrong in most of the frames". Later (14:45): "the direction of the notes in the desktop moves in the wrong way". The original MP4 versions were not recovered. |
| (Quest notes, Nov 13 23:50, voice note) | On the built Lab rift. | FEEDBACK: "I'm expecting the notes to move towards the rift like in the visualization and animations we made before. Right now, it doesn't look great. And also the rift isn't looking as amazing as they did in the concept art". |
| (Nov 14 03:35 to 03:41, text) | On the reference vs the rendered Lab effect. The side-by-side image is a technical comparison and is not archived. | FEEDBACK: "wanna go over the rift lab one again and see the reference and see if we can make it closer to the reference ? can you do a sbs comparison for me/". Then: "that energy beam. look up some shades or make some that would look this good. with light coming out of the." (his sentence ends there), "another diffrece is how these notes look glowy too . that's a shader i suppoer too", "and the rift also has those note particles coming out of it.", and about sparks: with physics. |

## 3. Marketing concept art (kept separate; Nov 5-8)

Not design references for the game. Concept art and promotional images.

| File | What it is | Status |
|---|---|---|
| marketing-g4c-key-image.png | G4C key image, 1920x1080 (Drive copy "Wall-Tones-2-G4C-Key-Image-Original"). Used in the approved shorts. That use does not prove Oded approved every element in it. | NO VERDICT RECORDED on the elements. |
| marketing-concept-1-room-is-the-board.png, marketing-concept-2-touch-the-tone.png, marketing-concept-3-follow-the-pattern.png | Concept art, Nov 6. | PROPOSED. He asked for them: "create some images like we did for the pattern game, and also create one with the images from the video but with better visuals for the buttons". |
| marketing-enhanced-glass-pads.png | Gameplay frame with enhanced pad visuals, from the same request. | PROPOSED. |
| marketing-concept-4-the-table-is-the-board.png, marketing-concept-5-tabletop-tones.png, marketing-concept-6-remember-the-melody.png | Tabletop concept art. | PROPOSED. |
| marketing-thumbnail-gameplay.png | Thumbnail from real gameplay. | NO VERDICT RECORDED. |
| marketing-voice-script-hero.png | Hero image for the voice script file (Nov 5). | NO VERDICT RECORDED. |
| marketing-leaderboard-hero.png | Hero image for the shared leaderboard file (Nov 8). | NO VERDICT RECORDED. The feature design may have changed since. Ask before relying on it. |

## 4. UI

| File | What it is | Status and Oded's words |
|---|---|---|
| ui-achievement-unlock-glow.png | Hero image of the achievement unlock celebration prototype. | No verdict on this image. He approved the prototype itself around Nov 12 01:06 ("looks great"). |

## 5. Recorded comments whose image files were not recovered

These existed only as WhatsApp attachments (Nov 5-12). The words below are his. No image was regenerated.

**Pad look and thumbnails (Nov 5-7)**
- wall_tones_mr_final_3x2 (larger pads on a living-room wall, title only). Replied to, Nov 5 21:22: "in a new PR can you make the buttons look more like the ones in the image you generated? glowy, futuristic, or whatever these are described? use shared , textures, animation whataver is needed ... it shoudl look nice on desktop. mobile and most imporatnt in mixed reality." Nearby 21:50: "the buttons seem a little too statuic. can you make thier texture patten animated somehow? also the glow should have this like fireye kinda animation to it. and the glow shouldn't be white. look at the reference image again and analyze the glow there"
- wall_tones_2_thumbnail_3x2: replied to, 16:35: "make a new thumnail with just the word "Wall Tones" no other text in this one."
- 16:9 and titled thumbnails (Nov 7 13:57): "Add the name of the game wall tones 2  and logo in the screenshots for devooat" and "And put the in a 2x2 grid like the mobile desktop version".
- Storyboard shots (Nov 7): he asked at 13:38 "I'd want to see a storyboard or a script first".

**Achievements, store, Game Over, Movement (Nov 11-12)**
- ach (achievements layout: icon grid, level badges, greyed locked, details). Replied to, Nov 11 11:06: "Achievement  needs pop ups when hover on PC, touched on iPhone and gaze/ ray in MR."
- ach2 (pop-up beside the icon). Replied to, 11:14: "Here also nicer icon visuals . Maybe for me a few artistic options to choose from in both mockups"
- ach_compare (A Neon arcade, B Gold RPG medallions, C Paper-cut pop). Nearby 11:20: "I like the square ones better . But within the square try a few styles for what woudl be the images in the boxes"
- achievements and store (four icon treatments: 1 outline, 2 sticker, 3 pixel, 4 glossy). Nearby 11:23: "Let's do one line glyphs for now" (likely treatment 1; inferred).
- store (tree layout). Replied to, 11:08: "The store should also have levels per category for example the hint shoudl have level 1 for 5, and 3 for more , and not in the tree but a gate for the next one "reach level x to unlock"" and "Add the auto play to that layout".
- store2 (category cards, no tree): REJECTED, replied to, 11:09: "No. This is wrong it needs to be a skill tree like before". store3 is store2 with Auto play added, no separate verdict.
- tree (skill tree restored): APPROVED, replied to, 11:14: "The concept is nice needs visuals images for the icons . We'll need to adapt them also later when the actual modifiers are in". tree_compare: A/B/C styles on the tree, no letter picked.
- go, go2, go3 (Game Over mockups). From his spec, nearby Nov 11 16:31: "Yes add a game over  screen! This is where you can use the streak saver", "This would be a pop up in all platforms", "In MR is shoudl be a panel in front of you like the menus". On go2 (replied to, 16:34): "If you don't have savers it shoudl open the store to let you buy some or offer you to buy them with your bars", then "Maybe just offer and not open store".
- movement_game_menu_mockups (three layouts A, B, C): REJECTED, replied to, 18:37: "I don't like any of these  layout. Did the gold bar iron dissappes? Remove that developer labels have the two moment info firels in the same line and keep the achievement for it in the achiebrmt sceeen ." The revised mv layout followed at 18:39.
- Mockup vs build (Nov 11 18:40): "The new achievement screen does not look at all like the mock up you sent me before first there is no words I was expecting the name of the achievement to be one word below the icon then the icons look a bit different even when they turned off they need to look nice." At 19:53: "yeah , the layout is better now. but the visuals aren't good in the PR. can you make the game look more like the mockup?" At 20:25: "the number badges look bad right now , the mock up had a dark inner circle ... in the mock up the icons were a bit shaded and had some reflection and glow to them" and "make more comparison between the mockup and the final products". At 21:08 on the new build: "much better".
- compare-connector (A: connector names the unlock requirement and shows progress; B: dots), Nov 12: PREFERRED A, nearby 11:44: "i prefer A with gate chip". compare-alignment (centered Replay/Saver and icon prices): comparison only.

**Armband and rift originals**
- Armband concept B image, the original armband concept A message image, and the rift concepts 1b, 2, 4, 5, 6 and rift motion MP4s were not recovered.

## 6. Not included

- Oded's own photos, screenshots and uploads (for example his Quest capture of the wristband clipping through his hand). They are his material and are not archived unless he sends them for this purpose.
- Technical side-by-sides and PR test captures. They are not references.
- Unsent internal variants.
- Other projects' assets.
- Oded's note: which of the early "square" art options he meant at Nov 11 11:20 is not stated; only the 11:23 line-glyph choice is explicit.
