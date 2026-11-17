# E2E case shards

The desktop suite runs ten isolated CI jobs, each with one Playwright worker.
No test body, assertion, timeout, retry policy, slow-test inclusion, or game code
changes as part of this split.

## Planning and coverage

`node scripts/e2e-shards.mjs plan 10` collects the complete Playwright inventory,
then places the longest estimated cases on the least-loaded shard. Equal costs
use a stable identity sort. The identity includes project, relative file, and
complete describe/test title, so line-number changes do not lose timing history.

The planner writes `.tmp/e2e-shards/{1..10}.txt`, one exact Playwright test list
per job. It recollects **each actual list**, verifies each selected identity
matches the intended list, then verifies every inventory identity appears once
across all ten. Missing, duplicate, extra, ambiguous-prefix, empty-inventory and
collection-error results fail before browser execution. A new case is collected
automatically; a new spec must also be added to the workflow's spec roster.

Each job runs its own list with the standard config. Tests still execute one at
a time, including the long real-mouse journey. The exact-head dispatch guard and
current-main reconciliation remain unchanged. Initial PR, main-push and manual
run policy is unchanged.

The initial history records 113 passing local case runs on main `7a4a490`,
measured on November 17, 2026, with one worker and retries disabled. The long
mouse case retains its cold estimate until the full GitHub run supplies a cost.
Local rendering costs differ from GitHub runners, so this seed is provisional.

## Measuring and updating

CI uses list, GitHub, JSON and HTML reporters. The list reporter shows named
case progress instead of only buffered dots. Each job retains its JSON report
and the complete shard plan for seven days, even after a failed run.

To turn downloaded reports into updated history:

```sh
node scripts/e2e-shards.mjs history path/to/shard-1.json path/to/shard-2.json
# Include every shard report, then review the generated file:
cat test-results/e2e-durations.json
# Copy reviewed data to scripts/e2e-durations.json in a follow-up commit.
```

Only completed passing cases contribute history. A case with retries includes
the total attempt cost. When the same case occurs in several reports, the
maximum measured cost is used. New or renamed cases fall back to 25 seconds,
except the existing long mouse journey, whose cold estimate is 240 seconds.
These are scheduling estimates, never a reason to skip or time out a test.

The five-to-six-minute goal must be checked against a complete GitHub run.
Planner estimates cover test time only, not checkout, install, build, browser
startup or queue time. A single indivisible long case and runner variation can
keep an individual shard outside the goal. More shards can reduce elapsed time
while increasing total setup runner-minutes; this change does not promise a
runner-minute saving.

## Acceptance

1. All current cases are selected exactly once by the planner.
2. Typecheck, unit tests and build pass.
3. All local E2E cases pass, apart from any specifically approved CI-only
   exception, which must pass in the complete GitHub run.
4. Record per-job total and test-step times, failures and retries from the full
   measured run before claiming the runtime target is met.
5. Keep merge approval separate from publication/testing permission.
