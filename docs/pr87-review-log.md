# PR #87 branch review log (2026-11-14 18:25 - 2026-11-15 02:50)

These review entries were recorded on the PR #87 branch (`feat/play-index-control-row`) in WALL_TONES_TODO.md. On integration (2026-11-15) the branch's TODO file was aligned to main's authoritative copy so main merges cleanly; the branch's numbered items 83-91 were dropped as duplicates of main's renumbered set (branch 83-86 = main 85-88, branch 87-91 = main 95-99). This file preserves the branch-side log verbatim.

## Review update - 2026-11-14, 18:25 Asia/Jerusalem

- PR #87 follow-ups from his 18:17-18:20 review of the control row / store (in this PR branch, awaiting his preview test):
  - Control-row spacing correction (18:17, verbatim): "PR 87 there is still somethign off about the spacing in the modiers row - it shoud be in the center beweeth the two buttons and the big button." - the Repeat/Play/Auto/Speed/X2 row is now vertically centered between the Modifiers/Achievements row and the Back button (was hugging the Back button).
  - New item 83 (his 18:17 ask, verbatim in the item): consider a smaller, higher Back button with different text. Consideration only - not implemented.
  - Multiplier control button relabel (18:19, verbatim): "the Multi button should not say the word multi but instead have a visual of a X mutiplier like X2 etc." - the button now reads X2, matching the settled store naming (Multiplier x2). No mechanic or price change.
  - Locked pads tile relabel (18:20, verbatim): 'the "pads 5-6" button should be Pad 5 and then Pad 6 when buying it.' - the locked tile now offers Pad 5 (next purchase in the sequence) and its detail card says Pad 6 is bought after Pad 5. The sequential buy mechanic itself stays unimplemented/unpriced.
  - Top Secret price change (18:20, verbatim): "secret should be 10,000 price" - TOP_SECRET_COST 1000 -> 10000 Bars, superseding the Nov 7 price only; other prices unchanged.
  - Autoplay price change (18:31, verbatim): "autoplay should cost like 5000" - AUTOPLAY_BASE_COSTS L1 250 -> 5,000 Bars, existing doubling kept for later levels (10,000/20,000/40,000), superseding his Nov 12 provisional 250.
  - Play indication design (18:24-18:27, verbatim): "when play button is played, i want the pattern to still aprea in the text line and the one that is being played should blink too", then "and after the play was played there should be some indication of what was played like a bounding white box around the notes that were played in the sequeence", then "or change thier color or something", then "conceptuialize some options" - during Play the pattern stays visible in the board text line with the currently-playing note blinking; after Play, the played notes keep a lasting distinction (white bounding box was his example, color change allowed). He asked for conceptualized OPTIONS first, so this is pending his pick between mockups - not yet implemented in the branch.


## Review update - 2026-11-14, 18:40 Asia/Jerusalem

- Autoplay indication steering (18:37, verbatim): "the same thign with autoplay and the text line it shouold stay on the hint like in play." - during Autoplay the hint text line stays visible with the same played/current indication as Play (options pending his pick).
- Autoplay toggle concept (18:37, verbatim): "also i'm not sure if we need an auto play button on the game menu. perhans in the modifier there would be an button to turn it off next to is after we bought it.  like to the right of it. it woudl be free and woudl just be and enable/disable buton for the autoplay" - tentative ("not sure", "perhaps") idea: a free enable/disable toggle to the right of the purchased Autoplay in Modifiers, possibly replacing the game-menu Auto button. Concept for review, not a settled removal; purchased level/progression and the 5,000 price are untouched; "free" refers to toggling, not purchase.
- Achievement icons 3D review (18:35-18:36, verbatim): "do we have an item in the todo list to review why the achivemen icons aren't in 3D like the concept document had ?" then "in the celebration especially". Investigation: the PR88 celebration (item 54) shipped the approved 3D treatment only for the Streak category - a rotating relief flame mesh (raw WebGL in flat mode, real mesh in MR); all other categories show their flat 2D icons in the celebration, and the achievements page grid icons are 2D glyphs. So per-achievement 3D logos beyond the Streak pilot were never built; that is the concept-vs-implementation gap. If WebGL init fails, flat mode silently falls back to the 2D image. No code change; extending 3D to all categories is his call.


## Review update - 2026-11-14, 18:45 Asia/Jerusalem

- Speed mechanic proposal (18:43, verbatim): "would it be complicated to also immplement speed?  4 levels for now it would make the pattern plat faster. maybe hald the speed in each level i don't know if it's too much. base price  should be like in the thousands . it would only speed up the notes N first that match the higher of the play or autoplay number. like if i have play 10 notes and autoplay 5 noted and the pattern is 15 notes it would only make the first 10 notes play faster should we implement the mulitplyer one here as well or wait to the next PR?" - proposal under assessment, NOT approved for implementation; advice to him: keep Multiplier for the next PR so Speed can be tested separately; halving per level reaches 16x at L4, curve not settled.

## Review update - 2026-11-14, 18:50 Asia/Jerusalem

- New item 85 (18:46, verbatim in the item): give the player something to do while longer patterns play - the rift is one possibility, other activities open. Backlog only.
- New item 86 (18:48, verbatim in the item): make all buttons and UI as 3D as possible - embossed elements and 3D models instead of flat icons. Broader than item 54's celebration treatment. Backlog only.
- Store label note counts (18:45, verbatim): "in the labels of all of the relevant buttons  with length, play, hint, autoplay, it would also have the length displayed in parenthasis like (Notes: 15) for level 3" - the Hint, Autoplay and Play store tiles now show their owned level's note count, e.g. "Play (Notes: 15)" at level 3 (5 notes per level for all three). No "Length" modifier exists; the closest tile is Listen (one-off, no levels, no per-level note count) - left unchanged pending his clarification whether Listen should show the current pattern length.

- New item 87 (18:51, verbatim in the item): play the next Cypher line during long Play/Autoplay note playback when the notes would outlast the line - the timing math needs care. Backlog only.

## Review update - 2026-11-14, 19:00 Asia/Jerusalem

- Play/Index indication settled and implemented (18:53, verbatim): "yes. dim + arrow.  implmenet the things you said in this PR." - during Play and Autoplay the hint row stays visible (his 18:24 and 18:37 asks), the note playing right now blinks and carries a small arrow marker, auto-entered notes stay dimmed afterwards with their colors still visible, and after playback the arrow stays on the last auto-entered note (the Index position). "length" clarified (18:55, verbatim): "i meant buttons that have modifiers that thier level gives different lengths of set of notes... like those three i mentioend." - the (Notes: N) labels on Play, Hint and Autoplay are exactly right; no fourth button.

## Review update - 2026-11-15, ~02:50 Asia/Jerusalem

- PR #87 physical-preview fixes from his 02:32-02:33 feedback (verbatim in the PR thread): the Index arrow no longer sits inline in the middle of the Hint row - each note now has a fixed arrow slot above it, so the arrow sits above its note and the row never shifts when the arrow appears or moves; and the "Note X of Y" index text line was removed entirely (he does not want that line). Arrow function itself unchanged. Pushed as head 470a4fc; Cloudflare preview serves it. Earlier the same night (his 01:50 feedback): the modifier control row no longer renders on the MR room-setup panel while it still appears in the game menu at run start (23a551b + 2be195d, PR CI green, preview verified).
- PR #87 integration: the branch TODO file was aligned byte-for-byte to main 413b0a5 so the merge-ready CI merge step applies cleanly; the branch review log lives in this file. Main's item numbering is authoritative (items through 100; next free 101).
