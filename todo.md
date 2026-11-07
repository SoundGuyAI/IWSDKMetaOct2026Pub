# Wall Tones 2 - November 6 notes


## Misc PR25 (merge approved November 6, final checks pending)
- [x] Debug colliders off by default; manual tuning toggle retained.
- [x] Page title: Wall Tones 2: too fast to wall. Game title: Wall Tones 2.
- [x] Original four-pad logo/favicon.
- [x] Shorten the first air-placement narration; keep useful auto-placement failure explanation.
- [x] Stop stale placement speech on progress; stop welcome/press instruction when first pad is pressed.
- [x] Disabled pads actually look dark/off. Demonstration notes still light; normal appearance returns for input.
- [x] Your Turn: inline colored square icons, no note/color names or missing-font squares.
- [x] Follow five-in-a-row milestones with random existing encouragement.
- [x] Every extension of the personal best gets a new-best line plus existing random praise.
  Approved: "New best streak!", "You beat your best again!", "Another new best!" (both voices).
- Declined / out of scope: shared overall high score. User chose to avoid backend complexity on November 6. No backend or score sharing added.
- [ ] Typecheck/build, pointer play, screenshot checks, CI/Codex review, deployed preview and test checklist.
- [x] User preview/merge approval received November 6 at17:54; final checks still required.


## Economy PR (backlog 11/12/12a/18/19) - in progress November 7
- [x] Gold Bars: 1 for streaks 1-5, 2 for 6-10, 4 for 11-15, doubling every five; persisted balance and lifetime total.
- [x] Store: persistent Your Turn hint unlocks at 10/15/22 Bars then ~1.3x growth (his examples + 'each next 5 costs more'), open-ended, tunable.
- [x] Your Turn hint gating per user November 7: row hidden without a hint owned (subtitles no longer reveal it), first 5 boxes per owned level, Listen unchanged.
- [x] Persist best streak, Bars, hint level, achievements, first-time flags (18).
- [x] Achievements: streak 5/10/15/20, Bars 25/100 lifetime, first pattern, first purchase, all hints; visual-only toast (19).
- [x] Approved voice lines (both host voices): first Bars earned, store welcome, hint explanation; each once per install.
- [ ] Score (11): interpretation still open with the user; not in this PR unless he answers before handover.
- [ ] Typecheck/build, e2e economy spec, CI/Codex review, deployed preview and test checklist.

## Approved merges
- [x] PR21: startup/restart fanfare timing. Merged 10e6419.
- [x] PR23: short pad-placement prompts and cancellation safety. Merged 235d94e.
- [x] PR24: failure encouragement / gentle single buzzer. Merged 12723fc.
- [x] Combined main deployment21/22/23/24 verified live November 6 at17:33.


## Separate PR22 - merged
- [x] Native Start / persistent mobile voice repair passed actual iPhone test, approved and merged1740739. Production verified November 6 at17:33.


## Follow-up preview revision (November6,16:45)
- [x] First run record announcements only3/6/9, then every record extension after10; later runs every new-best extension. Random approved lines retained.
- [x] Listen uses the same colored square sequence as Your Turn.
- [x] Accessibility submenu: Hearing accessibility: subtitles checkbox OFF by default, controls info and spoken captions. Flat captions below pads.
- [x] Separate opt-in color blindness checkbox adds actual color names beside icons.
- [x] Subtitle transcripts grounded in shipped recordings, captions start with playback and clear on completion/cancel.
- [ ] Test updated preview on phone/Quest before merge.

## PR pending: polish - fade + skip voice (November 6)
- [ ] Backlog 9: pads cross-fade between lit and dim in both directions (color, power, flash scale).
- [ ] Backlog 10: Skip voice button cancels playing/queued narration.
- [ ] Awaiting preview test and user approval; do not merge before then.

## Moved to WALL_TONES_TODO.md

Future ideas and polish lists moved to [WALL_TONES_TODO.md](WALL_TONES_TODO.md) on November 6.


## Settings build identity PR (requested November 7 ~21:04) - in progress
- [x] Settings menu shows package version and short commit hash, injected at build time (PR head SHA on previews via GITHUB_HEAD_SHA, GITHUB_SHA on main, git rev-parse locally, 'dev' fallback).
- [x] Same identity exposed as window.__wallTonesBuildInfo for test reports.
- [ ] CI, deployed preview pixel check, merge per user's conditional approval ("if that PR works we can just merge"; Codex unavailable, skipped per user November 7).
