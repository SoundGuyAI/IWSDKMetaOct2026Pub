# Instruction memory and contextual return reminders

Scope: remember completed reusable instructions, keep story/economy separate,
and offer binary contextual reminders once per reopened game page.

## Behavior

- Natural audio completion persists known tutorial IDs. Skip, cancellation,
  media failure, watchdog and captions-only playback do not mark a clip heard.
- New Run and voice changes retain memory. Reset All Data clears both tutorial
  memory and the returning-visit marker, without changing accessibility settings.
- First-time contexts teach normally. Returning contexts offer once per loaded
  page: before a round, on entering Modifiers, and on entering Achievements.
  In-page hub/world swaps retain the same session. Reopening/reloading makes a
  new session. Learning a context on that page does not immediately trigger a
  reminder on its next visit.
- Yes replays that context once without clearing heard state. No and six seconds
  without an answer dismiss without resetting anything. Skip and leaving cancel.
- No section picker. Visible Yes/No buttons support pointer, touch and immersive
  panel input. Y/N/Escape, existing pointer swings, permission-gated phone tilt,
  headset nod/shake and tracked thumbs use one bounded first-answer listener.
- No production speech recognition is added. Physical device accuracy remains a
  separate test from browser/controller simulation.

## Story-stage constraints

Return lines use fully completed saved windows, excluding a taken but unfinished
window. Cast is captured, with Cypher opposite the selected narrator.

C-R04 (Rifts still open) is recorded but not enabled after reopening: the current
Rift implementation does not persist an active encounter. Never infer currently
open Rifts from streak or a story seam. C-R05 (Rifts sealed) is held pending the
Rift branch's stable resolved/no-pending-ack state contract. These limits do not
change the approved words or alter encounter persistence.

## Audio

`return-dialogue.ts` is the exact reviewed script, with N-R03 deliberately absent.
Five Narrator and six Cypher clips exist in each voice set. Continuous raw
masters are retained separately for reproducibility. Cypher follows
`CYPHER_VOICE_RECIPE.md`; Narrator stays clean. Encoded assets are 24 kHz mono,
80 kbps MP3. Per-clip loudness/true-peak checks and transcript checks accompany
processing; parameter checks are not a substitute for an ear A/B with the old
clips.

## Verification targets

- Reload suppresses a completed tutorial; Reset All Data permits it again.
- Store/achievements legacy consumed-before-play flags no longer prevent retries
  after interruption. First-earned Bars, projector and Game Over instruction
  call sites also check completion memory rather than consuming on request.
- Returning contextual Yes/No/timeout do not change story, Bars, purchases or
  achievements, and same-page re-entry does not offer twice.
- Complete all existing local suites against the final reconciled tree and
  check CI discovery/roster before publication. No merge is implied.

## Opening-pattern transition

A separately tracked clean narrator clip identifies the startup pattern as a
start signal after the fanfare and platform start direction, immediately before
the unchanged listen/repeat recording. Both narrator sets use the same words.
Natural completion remembers the transition; Skip or failure does not. Existing
completed how-to tutorials stay complete, without resetting heard memory.
Explicit gameplay reminders retain their existing audio: they happen before the
fanfare, where a past-tense reference to the opening pattern would be misleading.
Original tutorial recordings and MR thumbs-up wording remain unchanged.
