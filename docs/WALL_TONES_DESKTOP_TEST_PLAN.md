# Wall Tones desktop test plan (E2E + CI/CD)

Scope: the Wall Tones game running in **desktop flat (non-XR) mode** in a
desktop browser, driven end to end through the built-in debug bridge. XR /
Quest headset behavior is out of scope for automation here; the manual
checklist below marks what still needs a human or an agent run.

Terminology: "CI/DI" in the original request is treated as CI/CD. This plan
only *adds* a test workflow; it does not change the existing
`decode-voice-clips.yml` workflow or the gh-pages deploy pipeline.

## How the game works on desktop (grounding for the tests)

- Boot: `index.html` starts the hub world. `AppModeSystem` reads
  `sessionStorage['iwsdk-experience-mode']`; the main-menu **Start Wall
  Tones** button persists `'walltones'` there and switches mode. Tests set
  the same key before load to enter the game deterministically.
- Flat path: with no XR session (`VisibilityState.NonImmersive`),
  `WallTonesSystem` spawns a 2x2 desktop pad grid and waits for a first pad
  tap (`flatAwaitingStart = true`, status "Tap any pad to start").
- Game loop (`src/wall-tones/sequence.ts` + `wall-tones-system.ts`):
  phases `idle -> playback -> input`, and `resetting` after a wrong pad.
  A run starts at 1 note; a completed round appends a random note and sets
  `streak = sequence.length`; a wrong pad clears the run and starts a fresh
  1-note run. `bestStreak` survives wrong inputs.
- Timing constants (`src/wall-tones/constants.ts`): note 0.55 s, gap 0.28 s,
  blink hold 0.22 s; startup fanfare = each pad once, 0.5 s pause, first pad
  x4, 0.65 s pause (about 9.5 s total); spoken intro (`howToPlay`) before the
  first note plus 0.85 s (`POST_INTRO_DELAY_S`); 0.55 s between rounds
  (`BETWEEN_ROUNDS_DELAY_S`); wrong pad plays an error tone + voice line,
  waits 0.9 s (`WRONG_RESET_DELAY_S`), replays the full fanfare, then deals
  the new run - so a wrong input takes roughly 15-20 s before input reopens.
  Idle during input for 15 s (`IDLE_REPLAY_S`) replays the pattern.
- Voice: prerecorded clips under `public/audio/speech/{male,female}/`;
  choice persists in `localStorage['wall-tones-voice-gender']`. Priority
  clips (`welcome`, `chooseMode`, ...) prefetch at startup. Milestone voice
  lines play at streaks 5/10/15/20 (`milestoneClipFor`); a failed run with
  progress gets a cheer instead of a wrong-line.
- Debug bridge: `WallTonesSystem` publishes `window.__wallTonesDebug` with
  `phase`, `flowPhase`, `sequence`, `inputStep`, `streak`, `bestStreak`,
  `flatAwaitingStart`, `slotCandidateCount`, `selectedSlotCount`, and
  `submitPad(i)` / `startFakeWallPick()` / `selectSlot(i)`. Tests assert on
  this bridge instead of pixels. 3D uikit panels (menu, HUD) are not
  DOM-clickable in headless runs, so menu interaction stays in the manual
  checklist.

## Automated E2E (Playwright)

Files: `playwright.config.ts`, `tests/e2e/wall-tones.desktop.spec.ts`.
Runs against `vite preview` of a production build in headless Chromium
(`--use-angle=swiftshader` for software WebGL,
`--autoplay-policy=no-user-gesture-required` for deterministic audio).

These are state-level E2E tests: they drive gameplay through the
`window.__wallTonesDebug` bridge, not through synthesized pointer events on
the canvas, so they do not prove the real click/tap path. Pointer-path
validation stays manual (see the limitation section below).

| # | Test | Asserts |
| - | ---- | ------- |
| 1 | Boot into flat mode | `__wallTonesDebug` appears, title "Wall Tones", `flowPhase === 'playing'`, `phase === 'idle'`, no page errors |
| 2 | Menu boot (no stored mode) | Menu does not auto-start: `flatAwaitingStart === false`, `phase === 'idle'`, no page errors |
| 3 | First pad tap | Leaves `flatAwaitingStart`, reaches `input` on a fresh 1-note run after fanfare + intro |
| 4 | Correct then wrong pad | Correct input completes round 1 (streak 1, best 1, next run 2 notes); wrong pad enters `resetting`, returns to `input` on a new 1-note run with `streak === 0` and `bestStreak === 1` (reset regression guard) |
| 5 | Voice persistence | With `wall-tones-voice-gender = 'female'` stored, a `/audio/speech/female/*` clip is requested at boot |
| 6 | Milestone (tagged `slow`) | Completing 5 rounds requests `milestone-5.mp3` and the run continues at 6 notes |

Run locally:

```
npm ci
npm run build
npx playwright install chromium
npm run test:e2e          # full suite
npm run test:e2e:ci       # fast suite only (skips the slow milestone test)
```

## CI/CD proposal (added in this PR)

`.github/workflows/ci.yml`, on pull requests and pushes to `main`:

1. **build-and-typecheck** - `npm ci`, `npm run typecheck`, `npm run build`
   (catches TS and bundling regressions on every PR).
2. **e2e-desktop** - Playwright fast suite (tests 1-5) against the production
   build; uploads the HTML report on failure.

Deliberately not changed: the gh-pages deploy flow stays as-is; merging a PR
still triggers deployment only through the existing mechanism. Possible later
steps: run the slow milestone test nightly, visual-regression screenshots,
and real-device (Quest) runs - none of that is in this PR.

## Manual / agent-driven desktop checklist (not automatable headlessly)

- Main menu renders; **Settings** gear opens the Voice submenu, Male/Female
  marked "(selected)" correctly, preview plays, Back restores the menu;
  **Enter XR** hidden on flat desktop.
- Start Wall Tones button click starts flat play; pads visibly blink during
  fanfare and playback; audio is audible.
- HUD (best streak / current streak / status) updates through a round, a
  wrong pad, and a milestone.
- Idle for 15 s+ during input: pattern replays (with idle voice line).
- Voice choice persists across a page reload (new session too).
- Compact/phone-width viewport: pad grid and HUD stay in frame.
- XR path (room scan, wall picking, air placement) still needs a headset;
  `startFakeWallPick()` + `selectSlot(i)` in the debug bridge can drive the
  wall-picking flow in an emulator for spot checks.

## Known limitation: synthetic pointer on the 3D canvas

The main-menu and HUD are 3D uikit panels rendered into the WebGL canvas.
Synthetic canvas clicks (headless Chromium, cloud browser) have not reliably
registered on them - observed 2026-11-05 when a cloud-browser canvas click on
the main-menu Settings gear did not register against the live bundle. That is
why the automated suite drives gameplay through `window.__wallTonesDebug`
(which calls the same `handlePadInput` a real tap reaches) instead of canvas
coordinates, and why menu/settings interaction stays on the manual checklist
with real pointer hardware. If a future harness adds pointer-based menu
tests, verify against the deployed site, not only a local build.
