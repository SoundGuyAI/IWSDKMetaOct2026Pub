> Historical planning document preserved by PR #64. This describes the earlier documentation stage. Later PR #70 work and `src/wall-tones/cypher-script.ts` determine implemented Act 1 behavior; the v0.1 inspiration backup remains unchanged. Statements below about unimplemented voices, gates, saving, review or merge approval are historical, not current task authority.

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



## Cloudflare Wrangler setup PR - in progress November 8
- [x] wrangler.jsonc: static-assets-only Worker named iwsdkmetaoct2026pub serving dist/ (Vite base './' already works at the workers.dev root).
- [x] npm script deploy:cloudflare wrapping npx wrangler deploy.
- [x] CLOUDFLARE.md: Workers screen values, Node version note, no-secrets note.
- [ ] CI/Codex review, PR preview build; user runs Deploy from his own Cloudflare account and tests; merge only on his explicit go-ahead.



## CI e2e sharding PR - in progress November 8
- [x] e2e-desktop split across 3 parallel runners (full suite still runs on PRs; serial per runner because gameplay timing/audio are per-page global). First --shard split measured 11.5/3.5/3.8 min on run 42421269922 (file-granularity imbalance), so shards are now explicit file groups by measured duration: economy alone, desktop+pointer, the lighter rest.
- [x] e2e-coverage job fails CI if a tests/e2e spec is not assigned to a shard.
- [x] changes job computes gameplay: Markdown/wrangler.jsonc-only changes skip e2e; build and typecheck always run.
- [x] deploy-pages tolerates a skipped e2e job and still requires it when it runs.
- [x] CI green with 3 shards on this PR, Codex review, user merge go-ahead.

## CI e2e test-frequency policy PR - in progress November 8
- [x] Gameplay e2e on GitHub runs on a PR's first push (opened), on every main push (safety net for the deployed result), and as a merge-ready run via Actions > CI > Run workflow on the PR branch with the `expected_sha` input; intermediate PR pushes skip it and rely on the final-head dispatch plus local `npm run test:e2e` before every push (user policy, November 8 - keep intermediate pushes light, but main advancing after a PR opened always gets fresh e2e against the combined code; build/typecheck stay automatic on every push).
- [ ] User review and merge go-ahead.

The merge-ready procedure is an enduring rule for every merge, not work in this PR; it is documented in .github/workflows/ci.yml at the workflow_dispatch block (expected_sha guard, combined-tree merge step, merge-time comparisons).


## Cypher story starter - 2026-11-11

1. [x] Draft `CYPHER_DIALOGUE.md` with stable line IDs, source wording appendix, story beats, sound cues and proposed mechanics clearly separated from owner decisions.
2. [x] Add owner backlog item 51 alongside existing story items 14 and 31.
3. [x] Prepare the separate documentation-only story PR; keep it unmerged for review.
4. [ ] Review dialogue, input options, streak gates, repeat/failure rules, unlock, comfort and persistence before any gameplay slice or voice generation.
5. [ ] After approval, implement and test in focused follow-up PRs. No runtime, economy, audio or deployment change is part of this starter.
6. [ ] Backlog item 52: only after Cypher gameplay is added, open a separate yes/no input feasibility PR (voice and nod/headshake options remain open).


## Cypher v0.2 review update

1. [x] Preserve exact v0.1 as a readable inspiration backup and revise current dialogue for hidden-channel Act 1.
2. [x] Record Act 2 discovery direction and Act 3 joint mission ending at streak 1024; do not silently invent intermediate gates or new characters.
3. [ ] Implement hidden story achievements, including drone defeat, only when real story encounter completion events exist; current PR records design and checks, not runtime completion.
4. [ ] After Cypher gameplay, item 52 separate yes/no feasibility PR also explores thumbs-up/down, alongside nod/headshake and voice.
5. [ ] Oded rereads the current draft; no voice generation, gameplay deployment or merge is approved by this revision.

## Backlog #58 menu / XR / scan loss - done 2026-11-12 (PR #78 merged)
- [x] Keep live world on Back to menu (`returnToMenuInPlace`); do not `switchBackToHubMenu`/`destroyActiveWorld`.
- [x] Strengthen choose-mode rescan capture/look-around recovery.
- [x] Unit policy test `tests/unit/back-to-menu-world.test.mjs`.
- [x] Full local `npm run test:e2e` green before PR push (51 passed; pointer first-press retry hardened).
- [ ] Headset verification still separate (not claimed by desktop suite / merge).

