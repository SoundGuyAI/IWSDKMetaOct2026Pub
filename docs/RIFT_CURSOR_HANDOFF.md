# Rift visuals: Cursor handoff (historical)

**Superseded for new agent chats by [`docs/RIFT_VISUALS_HANDOFF.md`](RIFT_VISUALS_HANDOFF.md)**
(which follows [`docs/AGENT_WORKTREE_PR_HANDOFF.md`](AGENT_WORKTREE_PR_HANDOFF.md)).
Keep this file as the Nov 17 baseline / analysis archive.

Updated November 17, 2026, 03:30 Asia/Jerusalem. Documentation handoff, not a gameplay change. The 00:28 runtime analysis below remains a dated baseline; recheck current source and runtime before changing anything.

## Start here

Original handoff baseline: main `4cdd0fc89f5c1a254e01b9d7505b85495c7c0e7d` at00:28. That test freeze is historical, not the current main version. Current source checkpoint is `59db8e522c62cd9c591893d175900265eb4172e6`; its CI/testing-root/production transitions must be checked separately. Work in a new worktree, branch and draft PR based on current source. No gameplay merge or deployment is authorized by this handoff. Read the repository's current AGENTS.md and applicable scoped project guidance. The original request was analysis/plan, then owner review before implementation; later owner decisions govern the visual PR.

The Rift Sealing Lab is already on main, from the PR91 work. It is not yet wired into the main storyline. Separate work is planning that integration: three rifts at the existing Cypher seam beat, energy from successful notes, and energy displays in the main game panel and palm projector. Its unresolved story/economy choices are not part of Cursor's visual task. Coordinate shared-file changes, especially rift-lab-system.ts, rather than copying an independent old version over newer work.

## Verified references

Read `docs/reference-images/index.md`, then open the actual images:

- Primary target: `docs/reference-images/15-rift-anim-f4-sealing.png`.
- Earlier hand energy: `docs/reference-images/2-rift-concept-1c-hands-4color.png`.
- Earlier layered hand-to-rift beam: `docs/reference-images/3-rift-concept-2b-beam-4color.png`.
- Four-color fracture direction: `docs/reference-images/11-rift-style-d-four-color.png`.
- Forming/widening/sealed stages: images 13, 14 and 16 in the same directory.

The earlier hand references exist, but the phrase "earlier concept" does not uniquely select one. Compare both 2 and 3; call out differing choices rather than silently treating the purple fantasy portal in image 3 as the target. Use the four-color wall fracture in image 15 as the primary direction. A still image is not proof of approved mechanics or of an animation's exact timing.

Visible reference elements to analyze: bright beam core, layered wisps/spirals around it, moving sparks and notes, concentrated palm source, fine luminous loops around hands/wrists, shiny green/red/blue/yellow note silhouettes, animated fracture edges, debris and sealing focal glow. No new camera shake: earlier motion feedback rejected shake and asked for the notes themselves to animate.

## What exists now

Source inspection at the main checkpoint shows:

- `src/rift-lab/rift-lab-system.ts`: live system, four-color fracture shader with time/open/seal uniforms, glow-dot sparks, colored note trails along four crack spines, small debris meshes, hand-note rendering, beam and desktop/mobile input wiring. `ensureBeamLine()` currently constructs a simple additive `LineBasicMaterial` line. The effect is not an empty placeholder, but the beam is far simpler than the reference's layered treatment.
- `src/rift-lab/rift-energy.ts`: pure energy/sealing state and orbit-note data. Existing tuning includes 10 energy/note, 240 cap, 120 required to seal, 1.5-second hold, four exact pad colors. Preserve behavior; do not treat old header comments as a complete current specification.
- `src/rift-lab/rift-hands.ts`: tracked palm pose and open-palm classification. Preserve interaction semantics.
- `src/rift-lab/rift-targets.ts` and `rift-dodge.ts`: target placement/avoidance helpers. Do not silently change spawn or placement rules.
- `src/rift-lab/rift-sounds.ts`: existing sound hooks. Leave assets, triggers and timing intact. The owner assigned sound effects to a separate PR (backlog item84); do not choose or replace audio in this visual PR without coordination.
- `public/ui/rift-lab.uikitml`: Lab panel; do not redesign unrelated UI.

This is a code-level baseline, not a fresh runtime visual comparison. Capture the current runtime yourself before claiming a measured visual gap or improvement.

## Ownership and boundaries

Cursor: reference analysis and, after plan review, Rift Lab rendering/animation improvements.

Separate work: Rift-to-story gameplay integration, sound-effects selection/licensing, and palm-projector panel/beam/input fixes. The Rift hand-to-wall sealing beam is NOT the short palm-to-panel projector beam from PR120/122/124. Do not merge those PRs, overwrite them, or fix their unrelated UI here.

Preserve desktop click and mobile drag behavior, energy costs, sealing duration, score/Bars rules, note charging, hand tracking and story/VO. If the desired look requires changing a mechanic, list it as a separate decision before implementation. Room-geometry collision effects and persistent closing behavior must be identified as distinct behavior work, not slipped into a shader refactor.

## Copyable prompt

In a new worktree, branch and draft PR, improve the VISUALS of the Rift Sealing Lab. Read this handoff and the current repository guidance first. Do not advance main or deploy as part of this visual task; check the current source and owner instructions rather than relying on the historical freeze checkpoint.

Use `docs/reference-images/15-rift-anim-f4-sealing.png` as the primary target, plus `2-rift-concept-1c-hands-4color.png` and `3-rift-concept-2b-beam-4color.png` in that directory for the luminous hand spirals, shiny four-color musical notes and energetic layered beam. Read the reference index and the forming/widening/sealed stages.

FIRST capture the current runtime and compare it with the actual images. Give me a gap list for beam, hand aura, note appearance/motion, Rift edges and sealing animation. Distinguish existing effects from missing layers. Propose a plan, likely files touched, performance risks and staged before/after checks. Flag conflicting reference choices. STOP and wait for my approval before implementation.

After approval, aim for a bright beam core with animated spiral filaments and traveling particles, a concentrated palm source, luminous hand/wrist loops, shiny recognizable four-color notes and an energetic sealing focal effect. Show me the tradeoffs rather than copying colors alone. No camera shake.

Keep this visual-only. Preserve energy, scoring, sealing rules, gestures, desktop click/mobile drag, story and voice. Sound effects belong to a separate PR: preserve existing audio hooks/assets/triggers. Coordinate shared files with the separate Rift-to-story integration. This is the hand-to-Rift beam, NOT the palm-projector panel beam.

Follow the project's prescribed rendering/testing workflow. Budget particles, transparency and draw calls for Quest; avoid per-frame allocations. Check forming/idle/firing/sealing/sealed, low energy and tracking loss. Provide comparable runtime before/after images and an animation clip, with device and performance measurements stated honestly. Separate emulator evidence from headset acceptance. Run typecheck, build, relevant unit checks and the full local end-to-end suite. Verify the preview serves the branch revision, then give Quest test steps. No merge or production deployment without my explicit approval.

## Integration sequencing update (Nov17 03:21)

The owner requested a separate Rift-to-game integration PR only after the new Cursor Rift Lab is merged. The new visual Lab PR129 is the scope-matching candidate at this checkpoint; confirm if a successor replaces it. Sound PR135 and geometry-particle PR131 are separate Lab work, not proof of main-game integration or permission to merge a Lab PR. Thumbs and nod integration are separate PRs. No gameplay implementation, economy change or new Cypher script is approved by this documentation update.
