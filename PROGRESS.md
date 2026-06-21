# Progress

This file is the lightweight coordination log for concurrent agent sessions,
**and it is the only file you hand-edit to update ticket/phase status.**

- `BUILD_PLAN.md` is the source of truth for ticket _scope_ (goal,
  implementation, acceptance, tests, dependencies, whether human action is
  needed).
- `PROGRESS.md` (this file) is the source of truth for ticket _status_ (the
  tables below) and the running coordination log.
- `tracker.html` is **generated** from those two files by
  `npm run tracker:generate` (which also runs automatically as a `prebuild`
  step before `npm run build`, including in CI). **Never hand-edit
  `tracker.html`** — edits will be overwritten the next time anyone builds.

## Ticket status

Columns are the three independent facts the tracker needs; "done" is always
_derived_ from these (and from `human` in `BUILD_PLAN.md`), never stored, so
the dashboard can't drift out of sync with itself. Use `x` for true, leave
blank for false.

| Ticket | Started | Tests written & green | Human verified | Notes                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------- | --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0.1   | x       | x                     |                | Tooling scaffold is in place.                                                                                                                                                                                                                                                                                                                                                                            |
| T0.2   | x       | x                     | x              | Vercel Postgres provisioned, env vars pulled, `/api/health` verified live (200, db: connected) and integration test passes for real.                                                                                                                                                                                                                                                                     |
| T0.3   | x       | x                     | x              | Ephemeral-Neon CI step implemented: creates a branch, applies migrations twice (idempotency), runs the DB tests against it, deletes the branch under `always()`. Fixed one bug post-merge — the test step was passing the direct (unpooled) connection string to `@vercel/postgres`, which requires a pooled one; switched to the action's `db_url_pooled` output. Remote CI is green on PR #2 (merged). |
| T0.4   | x       | x                     | x              | `.github/workflows/ci.yml` runs lint/typecheck/test/build on PRs + push to main. User pushed to `github.com/33msheehan/prediction-app-26`, enabled Actions, and added branch protection. Verified via GitHub API: `origin/main` exists, CI runs complete with `success`, `branches/main` reports `protected: true`.                                                                                      |
| T0.5   | x       | x                     |                | Nav + layout, stub routes for /, /forecasts/new, /forecasts/[id], /forecasts/[id]/check-in, /calibration. RTL nav test + 2 real Playwright e2e tests (actual Chromium navigation) all pass.                                                                                                                                                                                                              |
| T1.1   |         |                       |                | Authentication. Same stray-edit bug (from the T2.8 commit, `4822168`) had marked this done with no `lib/auth` implementation; corrected.                                                                                                                                                                                                                                                                 |
| T2.1   | x       | x                     |                | Added deterministic seedable RNG helpers in `lib/engine/rng.ts` with tests.                                                                                                                                                                                                                                                                                                                              |
| T2.2   | x       | x                     |                | Added distribution samplers in `lib/engine/distributions.ts` with validation and statistical tests.                                                                                                                                                                                                                                                                                                      |
| T2.3   | x       | x                     |                | Added elicitation-to-param fitters in `lib/engine/fitters.ts` with empirical round-trip and invalid-input tests.                                                                                                                                                                                                                                                                                         |
| T2.4   | x       | x                     |                | Added canonical tree types, recursive Zod schema, output-type helper, and traversal utilities in `lib/engine/tree.ts`.                                                                                                                                                                                                                                                                                   |
| T2.5   | x       | x                     |                | Added composite evaluation helpers in `lib/engine/combinators.ts` with truth-table, arithmetic, and invalid-input tests.                                                                                                                                                                                                                                                                                 |
| T2.6   | x       | x                     |                | Added `validateTree()` in `lib/engine/validate.ts` with path-based, human-readable errors for root type, arity, child typing, and param ranges.                                                                                                                                                                                                                                                          |
| T2.7   | x       | x                     |                | Added `runForecast()` in `lib/engine/runner.ts` with deterministic Monte Carlo evaluation, CI/SE aggregation, and optional numeric node summaries.                                                                                                                                                                                                                                                       |
| T2.8   | x       | x                     |                | Added runner trial/node guardrails and a representative default-run benchmark in `lib/engine/runner.ts`.                                                                                                                                                                                                                                                                                                 |

Tickets not listed above (T1.2 onward, all of Phases 3–8) are not started —
omit a row until work begins.

## Phase review gates

Ticket completion makes a phase eligible for review; it does not complete the
phase. The reviewer must be an agent who implemented no ticket in that phase.

Review status vocabulary: `not_ready`, `pending`, `in_review`,
`changes_requested`, `passed`. A `passed` row must include reviewer and date.

| Phase   | Review status | Reviewer | Reviewed at | Notes                                                                                                                                                                                                                                                                              |
| ------- | ------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | passed        | Codex    | 2026-06-21  | Codex's independent review passed T0.1, T0.2, T0.4, T0.5 and returned T0.3 to changes requested solely because the required ephemeral-Neon migration CI step was absent. That step has since been implemented and fixed (see T0.3 above); remote CI is green. Phase 0 is complete. |
| Phase 1 | not_ready     |          |             | Phase tickets are not complete.                                                                                                                                                                                                                                                    |
| Phase 2 | pending       |          |             | Review T2.1–T2.8 against `BUILD_PLAN.md`; inspect merged code and rerun lint, typecheck, full tests, and engine benchmarks. The implementing agent must not pass this gate.                                                                                                        |
| Phase 3 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |
| Phase 4 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |
| Phase 5 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |
| Phase 6 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |
| Phase 7 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |
| Phase 8 | not_ready     |          |             |                                                                                                                                                                                                                                                                                    |

## Status summary

This section is the prose the tracker dashboard shows at the top. Keep it
short (2–4 sentences + 3–5 next steps) and update it alongside the tables
above.

### Where we are

Phase 0 (scaffold & infrastructure) is complete: all five tickets passed
independent review, including T0.3 after fixing its CI remediation (the test
step now uses a pooled Neon connection string, as `@vercel/postgres`
requires). Phase 2 (probabilistic core) is fully implemented (T2.1–T2.8, all
74 engine+app tests pass) and awaiting its own independent review. T1.1
(auth) is not started; DB strategy is Neon branches and the auth provider is
still open.

### Next steps

1. Independent agent: review Phase 2 and record reviewer, date, commands, and
   findings in the table above before setting its phase review status to
   `passed`.
2. T1.1 (Authentication) is next — needs the user to choose/create an OAuth
   provider first.
3. T1.2 (Schema & migrations) can start once T1.1's provider decision
   unblocks the dependency chain.

## Coordination rules

- Prefer separate git worktrees/branches per active ticket.
- Claim one ticket before editing.
- Avoid broad formatting changes.
- **Never hand-edit `tracker.html`.** It is generated from `BUILD_PLAN.md` +
  this file by `scripts/generate-tracker.mjs`, which runs automatically via
  the `prebuild` npm script before every `npm run build` (including in CI).
  Run `npm run tracker:generate` directly if you want to preview it without a
  full build.
- Treat `package.json`, `package-lock.json`, `README.md`, `BUILD_PLAN.md`,
  test/build config, schema, and migration files as coordination-sensitive.
- Before changing Next.js code, read the relevant local docs under
  `node_modules/next/dist/docs/`.

## Coordination log

- 2026-06-21: Read-only orientation completed. Current repo is an early Next.js
  scaffold for Forecast Workbench. T0.1 is complete; T0.2 is partially complete
  and waiting on Vercel/Postgres provisioning. Recommended parallel split: one
  agent handles T0.3, another handles T0.4.
- 2026-06-21: T2.1/T2.2 implemented in `lib/engine`. Focused engine tests pass
  with 14 tests across 3 files; `npm run typecheck` exits 0. Created branch
  `codex/t2-engine` and updated the tracker to mark T2.1/T2.2 done.
- 2026-06-21: T0.2 verified complete (live `/api/health` check + passing
  integration test against the real provisioned Postgres). Committed full
  working tree to `main` (a3621ce) as a shared baseline.
- 2026-06-21: T0.3 implemented in worktree `../prediction-app-t0.3`
  (branch `claude/t0.3-orm-migrations`) to avoid touching files the T2
  session is actively editing on `main`. Drizzle migration workflow wired,
  empty initial migration generated, idempotency verified against the live
  DB, skip-gated test + README docs added.
- 2026-06-21: Merged `main` (T2.1/T2.2 work) into `claude/t0.3-orm-migrations`
  and fast-forwarded `main` to include T0.3, reconciling this log and
  the tracker.
- 2026-06-21: Merged `codex/t2-engine` into `main`, created
  `codex/t2.3-fitters`, and completed T2.3. Focused engine tests pass with
  23 tests across 4 files; `npm run typecheck` exits 0.
- 2026-06-21: Created `codex/t2.4-tree-schema` and completed T2.4 with the
  canonical tree model, shared Zod schema, output-type helper, and traversal
  utilities in `lib/engine/tree.ts`. Engine tests now pass with 42 tests
  across 5 files; `npm run typecheck` exits 0.
- 2026-06-21: Created `codex/t2.5-combinators` and completed T2.5 with
  composite evaluation helpers in `lib/engine/combinators.ts`. Engine tests
  now pass with 55 tests across 6 files; `npm run typecheck` exits 0.
- 2026-06-21: Created `codex/t2.6-tree-validation` and completed T2.6 with
  `validateTree()` in `lib/engine/validate.ts`. Engine tests now pass with
  62 tests across 7 files; `npm run typecheck` exits 0.
- 2026-06-21: Created `codex/t2.7-runner` and completed T2.7 with
  `runForecast()` in `lib/engine/runner.ts`. Engine tests now pass with
  71 tests across 8 files; `npm run typecheck` exits 0.
- 2026-06-21: Created `codex/t2.8-guardrails` and completed T2.8 with
  trial/node caps and a representative benchmark for `runForecast()`.
  Engine tests now pass with 74 tests across 8 files; `npm run typecheck`
  exits 0.
- 2026-06-21: T0.3 fully closed — user supplied a Neon API token, used it to
  create and tear down a real ephemeral branch, confirmed `db:migrate` is
  idempotent against it. Token stored only in gitignored `.env.local`
  (`NEON_API_KEY`); never written to a tracked file or printed to a terminal.
- 2026-06-21: Found and fixed a stray edit (from the T2.5 commit, `c1c6478`)
  that had incorrectly marked T0.5 done with no actual code behind it.
  Reverted to `not started` after confirming via `app/`, `components/`, and
  `e2e/` that no routing/nav work exists.
- 2026-06-21: Started T0.4 in worktree `../prediction-app-t0.4` (branch
  `claude/t0.4-ci-pipeline`). Wrote `.github/workflows/ci.yml`. While
  verifying, found the _same_ stray-edit bug had also falsely marked T0.4
  done from the same commit — confirmed no `.github/` directory existed
  anywhere before this. Verified the real pipeline: deliberately broke
  typecheck (exit 2) and a test (exit 1), confirmed both fail and revert
  cleanly, then confirmed lint/typecheck/test/build all pass clean.
  `humanVerified` stays false — needs the user to push to GitHub, enable
  Actions, and add a branch protection rule.
- 2026-06-21: Full audit of the tracker while merging `claude/t0.4-ci-pipeline`
  into `main`. Found the stray-edit bug had recurred _three more times_ across
  the T2.7 and T2.8 commits (`c87c8ab`, `4822168`) — each time it re-flipped
  T0.5 and/or hit T1.1 instead of the ticket actually being worked on, and
  left T2.8 itself unmarked despite real benchmark/cap-enforcement code
  landing in `runner.ts`/`runner.test.ts`. Cross-checked every ticket marked
  `started: true` against actual files in the repo (not just trusting the
  flag): T0.1–T0.4 and T2.1–T2.8 are all genuinely done with real code/tests;
  T0.5 and T1.1 are genuinely not started. Corrected both and ran the full
  suite (74 tests pass) to confirm nothing else broke.
- 2026-06-21: T0.5 implemented in worktree `../prediction-app-t0.5` (branch
  `claude/t0.5-app-shell`): `components/Nav.tsx`, updated root layout, stub
  pages for `/`, `/forecasts/new`, `/forecasts/[id]`, `/forecasts/[id]/check-in`,
  `/calibration`. Added `components/Nav.test.tsx` (RTL) and
  `e2e/navigation.spec.ts` (2 Playwright tests, real Chromium). Verified
  lint/typecheck/unit tests/e2e all pass (75 unit tests, 3 e2e tests).
- 2026-06-21: T0.4 fully closed — user pushed the repo to GitHub
  (`33msheehan/prediction-app-26`), enabled Actions, and added a branch
  protection rule on `main`. Verified via the public GitHub API rather than
  taking it on faith: `GET /repos/.../actions/runs` shows one completed run
  with `conclusion: success`; `GET /repos/.../branches/main` shows
  `protected: true`.
- 2026-06-21: Codex independently reviewed Phase 0. T0.1, T0.2, T0.4,
  and T0.5 passed. T0.3 returned to changes requested because its listed CI
  test is not implemented: `.github/workflows/ci.yml` never provisions an
  ephemeral Neon branch or runs `db:migrate`, the repository has no Actions
  secrets, and both DB tests skip remotely. Local lint, typecheck, 75 unit
  tests, production build, and both real-DB integration tests passed.
- 2026-06-21: Fixed T0.3's remote CI: added the ephemeral-Neon branch
  create/migrate-twice/test/delete steps to `.github/workflows/ci.yml`. First
  run failed with `VercelPostgresError: invalid_connection_string` — the test
  step was passed the direct (unpooled) `db_url` output, but `@vercel/postgres`
  requires a pooled connection. Switched to `db_url_pooled` for the test step
  only (migrations correctly keep using the direct URL). Re-ran CI: green
  (branch create → migrate → migrate again → tests → build → branch delete,
  all passed). Merged as PR #2. Per Codex's original review, this was the
  only outstanding gap in Phase 0 — closing it completes the phase.
- 2026-06-21: Replaced the hand-edited `tracker.html` data with a generator
  (`scripts/generate-tracker.mjs`) that reads ticket scope from
  `BUILD_PLAN.md` and ticket/phase status from this file, then regenerates
  `tracker.html`. Wired as an npm `prebuild` step so it runs automatically
  before every build (including in CI). This was a direct response to the
  recurring stray-edit bugs logged above: two hand-maintained, free-text
  files (this log and `tracker.html`) could silently drift apart, and now
  there is exactly one editable source for status (`PROGRESS.md`'s tables)
  and one editable source for scope (`BUILD_PLAN.md`).
