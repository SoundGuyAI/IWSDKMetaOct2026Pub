# Voice yes/no lab - research notes

Isolated test scene for spoken yes/no input (requested 2026-11-18). Entry:
main menu > "Voice Yes/No Lab". Same branching Cypher dialogue as the nod
and thumbs labs, but the answer channel is the player's voice: an on-device
speech-commands model classifies what it hears, and a clear "yes" or "no"
answers the prompt - outright at score >= 0.8, or as the clear winner at
>= 0.5 when it beats every other class by at least 2x (accent/headset
fallback, added Nov 19 after Oded's live "no" went unheard).

This is a research scene. It exists to find out how well spoken single-word
answers work as input on the real headset, not to claim a finished input
method.

## Lab fiction premise (narrow, lab-only)

The dialogue says Cypher can barely hear the player: only single clear
words like yes or no make it across the static, and anything else arrives
as noise. That is Oded's direction of 2026-11-18 and a diagnostic premise
for this isolated lab only, exactly like the one-way-link premise of the
nod and thumbs labs. This lab does not extend Act 1. If voice answers ever
join the production story, how Cypher receives them is Oded's decision
first.

## How detection works

- `src/voice-lab/voice-receiver.ts` wraps the vendored TensorFlow.js
  speech-commands model under `public/voice-lab/` (BROWSER_FFT, same-origin
  model URLs, sequential vendored script injection). Everything runs
  on-device; no audio leaves the headset.
- While a prompt awaits an answer, the receiver streams scores. A "yes" or
  "no" at score >= 0.8 submits that answer. Under 0.8 a yes/no still
  submits when it is the clear winner: >= 0.5 and at least 2x every other
  class, including the other answer word. Any other recognized word above
  the threshold, or a yes/no without a clear win, counts as noise and is
  shown in the panel telemetry without answering.
- Listening runs in 12-second windows, the same shape as the nod lab's
  timed listen. When a window ends with no clear yes/no, Cypher speaks one
  of four rotating "only noise came through" lines and re-arms. The window
  clock only advances while the receiver is truly streaming, so a flat
  desktop browser with no microphone never spins the noise loop: the
  on-panel Yes/No buttons and the Y/N keys answer there instead.
- The panel shows receiver state (loading model / ready / listening / mic
  unavailable), the live top word and score, the accept threshold, the
  listen-window countdown and a noise counter, so misreads are visible
  immediately.

## Voice

Spoken Cypher lines reuse the shared gesture-lab clip set
(`docs/CYPHER_LAB_CLIPS.md`). The six voice-lab-only lines (intro, retry
and four noise lines) are DRAFTS written from Oded's 2026-11-18 direction,
listed in the clips spec, pending his review; no clips exist for them, so
the lab runs the established silent text-preview mode for those ids. Voices
off (accessibility) forces text-only mode as in the other labs.

## Verified in this PR

- TypeScript, production build, unit tests, e2e suite (flat Chromium):
  menu row wiring, full dialogue tree across both branches and the intro
  retry loop, answer echo order, classifier unit behavior (yes/no above
  threshold answers, a clear-winner yes/no under the threshold answers,
  other accepted words count as noise, weak or contested words count as
  faint), receiver state transitions with no microphone
  (model loads, listen reports mic-unavailable, buttons/keys still drive
  the dialogue), noise-line rotation on expired listen windows.

## NOT verified - needs Oded's headset pass

- Real microphone capture on the Quest browser, model load time on
  headset hardware, and the feel of the 12-second window in XR.
