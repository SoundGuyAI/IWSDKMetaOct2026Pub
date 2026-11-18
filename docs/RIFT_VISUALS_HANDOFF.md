# Rift Sealing Lab visuals — agent handoff

Updated November 18, 2026. Task-specific handoff for **visual** work on the
Rift Sealing Lab.

**Process:** follow [`docs/AGENT_WORKTREE_PR_HANDOFF.md`](AGENT_WORKTREE_PR_HANDOFF.md)
for worktree / branch / draft PR / verify / no-merge rules. This file only
adds Rift-visual scope, references, current state, and acceptance.

Historical baseline notes (dated Nov 17 analysis) live in
[`docs/RIFT_CURSOR_HANDOFF.md`](RIFT_CURSOR_HANDOFF.md). Prefer **this** file
for new chats; use the older one only for context.

## Goal

Close the gap between Quest captures and the approved reference art for the
Rift Lab sealing experience: layered beam, hand energy nest, note torrent,
volumetric portal particles, and welding-style geometry sparks — **visual
only**.

## In scope

- Rendering / animation in `src/rift-lab/` (beam, hand aura, notes, fracture
  look, sealing melt, geometry-collision spark **presentation** already in the
  visual PR).
- Runtime captures and before/after evidence (desktop emulator vs Quest called
  out honestly).
- Draft PR updates on the visuals branch; coordinate overlapping Lab PRs in
  the PR description.

## Out of scope

- Gameplay economy, energy costs, seal duration, score/Bars rules.
- Storyline / Cypher integration of rifts into the main game.
- SFX selection or replacement (separate PRs; preserve existing hooks).
- Palm-projector short beam / panel (PR120/122 family) — **not** the
  hand-to-rift sealing beam.
- Silent merges, production deploy, or folding unrelated Wall Tones fixes.

## Active branch / PR (as of this handoff)

| Item | Value |
| --- | --- |
| Branch | `feat/rift-seal-visuals` |
| Worktree (if present) | `C:\UnityProj\IWSDKMetaOct2026Pub-rift-visual` |
| Draft PR | https://github.com/SoundGuyAI/IWSDKMetaOct2026Pub/pull/129 |
| Related (supersede plan) | #131 geometry particles — absorb into #129, then close #131 |
| Related (leave alone) | #133 / #135 SFX; storyline integration stays separate |

Reuse the existing worktree/branch when continuing this task. Only cut a new
branch if the owner asks for a split PR.

## References (read images, not only this list)

Read `docs/reference-images/index.md`, then open:

| File | Role |
| --- | --- |
| `15-rift-anim-f4-sealing.png` | **Primary** sealing look |
| `2-rift-concept-1c-hands-4color.png` | Hand energy nest / four-color notes |
| `3-rift-concept-2b-beam-4color.png` | Layered beam + spirals + note stream |
| `11-rift-style-d-four-color.png` | Preferred fracture style |
| `13` / `14` / `16` | Forming / widening / sealed stages |
| `21-rift-motion-mockup.gif` | Motion direction (no camera shake) |

Still images are direction, not approved mechanics or exact timing.

## What already landed on #129 (do not re-litigate blindly)

Recheck source on the branch head before editing:

1. Beam gate: hold on firing/`getBeamHand()`; start only via `getFiringHand()`.
2. `rift-seal-beam.ts`: thin core + corkscrew mesh ribbons, palm flare/wisps,
   beat-step pad colors, slow multi-speed corridor wisps, `depthTest: false`
   where needed so palm occluders do not eat the effect.
3. `rift-hand-aura.ts`: dense chaotic filament nest + embers.
4. Dedicated note torrent pool (orbit notes stay on hands).
5. Portal sparks/trails with out-of-plane lift.
6. Item 93 physics absorbed from #131: `rift-geometry-particles.ts` + sealing
   spray, seal burst, beam-hit welding spray; unit + e2e coverage.

Owner Quest acceptance is still required. Flat hub screenshots under-read
additive VFX against bright rooms.

## Known pitfalls

- WebGL `Line` ≈ 1px on Quest — use mesh ribbons/tubes for visible threads.
- Fat opaque cores wash out spirals; keep the core thin so threads dominate.
- Palm depth occluders hide nearby additive VFX unless materials opt out of
  depth test intentionally.
- Emulator ≠ Quest. Pose / beam / hand claims need an immersive session.
- Do not confuse sealing beam with palm-projector beam.

## Merge plan reminder

1. Owner Quest-checks #129.
2. Merge-ready: reconcile with latest `main`, full local e2e on combined head.
3. Merge #129 only with explicit owner go-ahead.
4. Close #131 as superseded (do not merge both).
5. Rebase later Lab PRs onto `main` afterward.

## Acceptance checklist

- [ ] Corkscrew threads readable around the beam on Quest
- [ ] Hand filament nest readable on the firing palm
- [ ] Slow corridor wisps travel hand → hit at varied speeds
- [ ] Note torrent beside the beam while sealing
- [ ] Portal particles read in 3D (not a flat sticker)
- [ ] Welding sparks fall/bounce/fade from beam hit and sealing spray
- [ ] No beam blink when non-dominant palm opens
- [ ] Typecheck + relevant unit tests + full local e2e green on reconciled head
- [ ] Preview serves this branch’s latest commit
- [ ] PR body/test plan current; related-PR merge notes accurate

## Copyable prompt

```text
You are continuing Rift Sealing Lab VISUAL work for owner Oded (Jig).

Process: docs/AGENT_WORKTREE_PR_HANDOFF.md
Task:    docs/RIFT_VISUALS_HANDOFF.md
Also read AGENTS.md and invoke iwsdk-dev (iterate path).

Reuse branch feat/rift-seal-visuals / worktree IWSDKMetaOct2026Pub-rift-visual /
draft PR #129 when present. Do not start a duplicate visuals PR unless asked.

Goal: make Quest visuals match refs 15 / 2 / 3 (layered beam, hand nest, note
torrent, volumetric portal particles, welding sparks). Visual-only — preserve
gameplay, gestures, SFX hooks, palm-projector.

1. Confirm worktree/branch/PR state and latest commits.
2. Capture or use a fresh Quest/runtime view; gap-list against the reference
   images (do not trust stale captures alone).
3. Implement only the remaining visual gaps; coordinate/absorb overlapping Lab
   PRs explicitly (see merge plan in the task handoff).
4. Typecheck; run relevant unit tests and full local e2e; push; update the
   draft PR with preview link + Quest steps.
5. Never merge or deploy without explicit owner approval.
```
