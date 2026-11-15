# Check the complete tree before publishing

Use the Node version in `.nvmrc`. Install Chromium once with
`npx playwright install chromium` after `npm ci`.

Run `npm run preflight` from the repository root before opening a PR and before
publishing an update. It stops at the first failed step:

1. Verify every local E2E spec is listed exactly once in both existing CI lists.
2. Clean install from the lockfile with `npm ci`.
3. Typecheck, all unit tests, then a production build.
4. The complete desktop E2E suite, including slow tests, against a fresh preview
   server. An occupied port fails instead of testing an older running build.

The E2E runner uses `CI=1` for parity with CI's fresh server, retry and report
settings. Browser dependencies must already be available. It does not dispatch
GitHub Actions, deploy, merge or change any account settings. Existing hosted
CI checks and their frequency are unchanged.

For a quick shard check alone, use `npm run check:e2e-coverage`. It reads the
existing `.github/workflows/ci.yml` lists directly and fails if their format is
no longer supported. This does not replace the full preflight. Whenever adding
an E2E spec, update both the CI matrix and CI coverage list in the same change.

Assemble every required source file and asset before publishing the tested
change. Commit the complete tree together. Separate file edits to a watched
PR can start CI against an incomplete import graph. Do not retry a failed job
until its actual cause has been identified and addressed. Record the tested
commit; changing the tree after a green run requires checking it again.

This is a desktop check, not a Quest hardware test or permission to merge.
