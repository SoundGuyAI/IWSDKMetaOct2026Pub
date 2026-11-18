# Agent handoff template: new worktree / branch / draft PR

Reusable prompt for starting a **focused** bug-fix or feature PR in this
repo. Copy the **Copyable prompt** section into a new chat, fill the
placeholders, and attach or link any task-specific handoff that extends this
file.

Owner: Oded (Jig). Do not merge or deploy without his explicit approval for
that specific PR.

## When to use this

- One focused change (bug fix, visual pass, feature slice).
- Work must live on a **new branch** in a **new or dedicated worktree**.
- Deliverable is a **draft PR** against `main` (unless the task handoff says
  otherwise).

Do **not** use this for drive-by edits on `main`, combined mega-PRs, or
silent merges of unrelated fixes.

## Before you start (read first)

1. `AGENTS.md` and any path-scoped rules for the files you will touch.
2. Invoke `iwsdk-dev` (iterate path for established-app changes; planner only
   for greenfield / product-definition work).
3. `todo.md` for active agent work; `WALL_TONES_TODO.md` only for recording
   owner ideas (do not treat it as your task board).
4. `docs/reference-images/index.md` before changing anything with a visual
   reference.
5. The **task-specific handoff** named in the prompt (if any).

## Repo operating rules (always)

| Rule | Detail |
| --- | --- |
| Authority | `iwsdk.config.json` is project authority, not `vite.config.ts`. |
| Three.js | Import from `@iwsdk/core`, never from `three` (types-only exception for addons). |
| Dev server | `npx @iwsdk/cli dev up` / `npm run dev`, not raw `vite`. Wait for `browserCommandReady: true` before browser-backed commands. |
| Typecheck | Always `npm run --if-present typecheck` before claiming it works. |
| Verify | Match the right signal: scene/editor → `scene_get_state`; XR → `xr_get_session_status`; server → `dev status`. Runtime claims need runtime screenshots/sessions, not editor-only views. |
| PRs | One focused change per PR. Never merge without owner go-ahead. Before merge readiness: merge latest `main` into the PR branch, resolve conflicts, run typecheck / build / relevant unit tests / full local e2e on the reconciled head. |
| CI | Register new `tests/e2e/*.spec.ts` in both e2e-desktop shard matrix and coverage list in `.github/workflows/ci.yml`. |
| Secrets | Repo is public: no secrets, private data, or internal tooling details. |
| Commits | Commit/push when continuing the PR test loop or when asked; do not force-push `main`. |

## Worktree / branch / PR recipe

```text
# From the main checkout (adjust paths):
git fetch origin
git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> origin/main

cd <WORKTREE_PATH>
npm ci   # or npm install if that is the project norm

# After work is typecheck-green and locally verified:
git push -u origin HEAD
gh pr create --draft --title "<TITLE>" --body "<SUMMARY + TEST PLAN>"
```

Suggested naming:

- Branch: `fix/<short-slug>` or `feat/<short-slug>`
- Worktree: sibling folder, e.g. `IWSDKMetaOct2026Pub-<short-slug>`
- PR: draft until owner accepts; include preview link, device, and exact check steps

If a sibling worktree already exists for this task, **reuse it** instead of
forking a second copy of the same branch.

## Fill-in fields for the task handoff

Task-specific handoffs should set:

| Field | Example |
| --- | --- |
| Goal | Fix beam blink when non-dominant palm is open |
| In scope | Named files / systems / visuals |
| Out of scope | Gameplay economy, SFX, unrelated Labs |
| Base | `origin/main` (or named PR if stacking is required) |
| Branch / worktree | `feat/...` / path |
| References | Image paths, owner quotes, prior PRs |
| Acceptance | Observable checks on desktop / Quest / glasses |
| Related PRs | Coordinate or supersede; never silent-duplicate |
| Stop points | Plan-first vs implement-now |

## Copyable prompt

Paste into a new agent chat and replace every `<...>`:

```text
You are working in the IWSDK / Wall Tones public repo for owner Oded (Jig).

Follow docs/AGENT_WORKTREE_PR_HANDOFF.md for process (worktree, branch, draft
PR, verify, no merge without approval). Also follow AGENTS.md and invoke
iwsdk-dev before editing the app.

Task handoff (read fully before coding):
  <PATH_TO_TASK_HANDOFF.md>

Goal:
  <ONE_SENTENCE_GOAL>

In scope:
  <BULLETS>

Out of scope (do not change unless the owner explicitly expands scope):
  <BULLETS>

Base:
  origin/main  (or: <BASE_REF>)

Create or reuse:
  worktree: <WORKTREE_PATH>
  branch:   <BRANCH_NAME>
  draft PR against main when the change is ready to preview

Workflow:
  1. Sync/fetch; create or enter the worktree/branch.
  2. Inspect current source + runtime for the affected area (do not trust stale
     screenshots alone).
  3. If the task handoff says plan-first: propose a short plan and STOP for
     approval. Otherwise implement the bounded change.
  4. Typecheck. Run relevant unit tests and the full local e2e suite before
     opening or updating the PR.
  5. Push and open/update a draft PR with summary, test plan, preview link,
     device, and exact steps.
  6. Record agent progress in todo.md. Put owner ideas only in WALL_TONES_TODO.md.
  7. Never merge or deploy without explicit owner approval for this PR.

Constraints:
  - One focused PR; no unrelated fixes folded in.
  - Preserve behavior outside the stated scope.
  - Quest / XR claims need immersive evidence; flat screenshots are not enough
    for pose or interaction acceptance.
  - If related open PRs touch the same files, coordinate or absorb/supersede
    explicitly in the PR description — do not silently duplicate systems.

Start now by reading the two handoff docs and confirming branch/worktree state.
```

## After the PR exists

- Keep the PR body current (merge plan with related PRs, known gaps, preview URL).
- Comment on overlapping PRs when absorbing or superseding work.
- Before merge readiness: reconcile with latest `main` and re-run local checks on
  the combined head (owner merge-readiness rule).
- Headset / glasses acceptance stays separate and visible from CI green.
