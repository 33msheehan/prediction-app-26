# Progress

This file is the lightweight coordination log for concurrent agent sessions,
**and it is the only file you hand-edit to update ticket/phase status.**

- `BUILD_PLAN.md` is the source of truth for ticket _scope_ (goal,
  implementation, acceptance, tests, dependencies, whether human action is
  needed).
- `PROGRESS.md` (this file) is the source of truth for ticket _status_ (the
  tables below) and the running coordination log.
- `tracker.html` and the "Ticket tracker" section of `README.md` (between the
  `<!-- TRACKER:START -->` / `<!-- TRACKER:END -->` comments) are **generated**
  from those two files by `npm run tracker:generate` (which also runs
  automatically as a `prebuild` step before `npm run build`, including in CI).
  **Never hand-edit either of them** — edits will be overwritten the next
  time anyone builds.

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
| T1.1   | x       | x                     |                | Auth.js v5 wired with GitHub OAuth (`auth.ts`), JWT session strategy (no DB adapter — upserts into our own `users` table by email on first sign-in via the `jwt` callback), `getCurrentUser()` in `lib/auth/session.ts`. Route protection lives in `proxy.ts` (this Next.js version renamed `middleware.ts` to `proxy.ts`), with the redirect/401 decision logic factored into `lib/auth/route-guard.ts` for unit testing without a real JWT. `AuthButton` added to the layout for sign-in/out. 11 new tests pass; `next build` confirms the Proxy registers. **Not yet human-verified**: needs a GitHub OAuth App (client id/secret) and `AUTH_SECRET` in `.env.local`/Vercel — `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET` are still empty.                                                                                                                                                                                                                                                                 |
| T1.2   | x       | x                     |                | Drizzle tables for `users`, `forecasts`, `forecast_versions` per BUILD_PLAN §5, including the circular `forecasts.currentVersionId` ↔ `forecast_versions.forecastId` FK (resolved via Drizzle's lazy `.references()` callback). Migration `0001_smiling_marvel_boy.sql` generated and applied to the real provisioned Neon DB (re-ran `db:migrate` to confirm idempotency). 3 new integration tests (insert chain + reload, FK violation, versionNo uniqueness) pass against the real DB; updated `migrations.test.ts`'s row-count assertion to read the journal length instead of a hardcoded `1`.                                                                                                                                                                                                                                                                 |
| T1.3   | x       | x                     |                | Repository functions in `lib/db/repository.ts` (`createForecast`, `getForecast`, `listForecasts`, `appendVersion`, `resolveForecast`), all scoped by `userId` (ownership checked via `getForecast` before any mutation; throws `ForecastNotFoundError` rather than leaking another user's row). Reuses T2.4's `TreeSchema` + the runner's internal `validateTree()` call for tree validation (wrapped as `TreeValidationFailedError`); added `lib/validation/forecast.ts` for the forecast-metadata Zod schema (title, cadence). 13 new tests (6 DB-integration ownership/CRUD tests, 7 cadence-schema unit tests) pass against the real DB.                                                                                                                                                                                                                                                                 |
| T1.4   | x       | x                     |                | `lib/db/seed.ts` exports an idempotent `seedDemoData()` (demo user + one small bernoulli-leaf forecast + initial version, via T1.3's repository functions); `scripts/seed.ts` is the `npm run seed` CLI wrapper. Ran it twice manually against the real Neon DB — second run returns the same user/forecast ids, no duplicates. Factored the inline test user create/cleanup duplicated across `schema.test.ts` and `repository.test.ts` into shared `lib/db/test-helpers.ts` (`createTestUser`/`deleteTestUsers`) per the ticket's "test-DB setup/teardown helpers" requirement, and refactored both files to use it. Added `lib/db/seed.test.ts` as the harness self-test (seed twice → query → assert one user, one forecast with `currentVersionId` set, one version with `headlineP` in `[0,1]`).                                                                                                                                                                                                                                                                 |
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
| Phase 1 | not_ready     |          |             | All four tickets (T1.1–T1.4) done, tests green against the real Neon DB. Only T1.1's human-verification step remains (GitHub OAuth App + `AUTH_SECRET`) before this phase is ready for independent review by an agent who didn't implement T1.1–T1.4 — flagging it `not_ready` rather than `pending` until that's confirmed.                                                                                                                                                                    |
| Phase 2 | passed        | Claude   | 2026-06-21  | Independently reviewed T2.1–T2.8 (implemented by Codex) against `BUILD_PLAN.md` §4: read all 8 `lib/engine` source files, verified all 9 leaf distributions, all 7 combinators, all 5 `validateTree()` rules, and the runner's analytic anchors. Found and fixed two issues on `codex/phase-2-independent-review`: (1) the triangular/PERT schema allowed `min === max` while the elicitation fitter rejected it — schema now requires `min < max`; (2) `validateTree()` had no duplicate-node-id check, which the data model relies on for per-node history reconstruction — added `validateUniqueIds()`. Added 3 regression tests. Reran lint, typecheck, full suite (78 passed, 2 skipped), and `next build` — all clean. |
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
requires). Phase 2 (probabilistic core) passed independent review by Claude:
a schema/fitter inconsistency on degenerate triangular/PERT params and a
missing duplicate-node-id check in `validateTree()` were found and fixed,
with 3 new regression tests (78 tests total, lint/typecheck/build all clean).
All of Phase 1 (T1.1–T1.4: auth, schema/migrations, data-access layer, seed
& test harness) is implemented and tested against the real provisioned
Neon DB: GitHub OAuth via Auth.js v5 (JWT sessions, no DB adapter — we
upsert into our own `users` table instead of adding Auth.js's account/
session tables), the `users`/`forecasts`/`forecast_versions` schema with
the circular current-version FK, a `userId`-scoped repository layer
reusing the Phase 2 engine's tree schema and validator, and an idempotent
seed script + shared test-DB helpers. 108 tests pass, lint/typecheck/build
all clean.

### Next steps

1. T1.1 needs the user to create a GitHub OAuth App and set
   `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`/`AUTH_SECRET` before it's
   human-verified — this is the only thing blocking Phase 1 review.
2. Once that's done, Phase 1 is ready for independent review (by an agent
   who didn't implement T1.1–T1.4) — left open on PR #5 for Codex per the
   user's request.

## Coordination rules

- Prefer separate git worktrees/branches per active ticket.
- Claim one ticket before editing.
- Avoid broad formatting changes.
- **Never hand-edit `tracker.html` or the `<!-- TRACKER:START -->` ...
  `<!-- TRACKER:END -->` section of `README.md`.** Both are generated from
  `BUILD_PLAN.md` + this file by `scripts/generate-tracker.mjs`, which runs
  automatically via the `prebuild` npm script before every `npm run build`
  (including in CI). Run `npm run tracker:generate` directly if you want to
  preview it without a full build.
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
- 2026-06-21: Claude independently reviewed Phase 2 (T2.1–T2.8, implemented
  by Codex) on branch `codex/phase-2-independent-review`. Read every
  `lib/engine` source file against `BUILD_PLAN.md` §4 — all 9 leaf
  distributions, all 7 combinators, the Zod tree schema, `validateTree()`'s
  5 rules, and `runForecast()`'s analytic anchors checked out correct.
  Found two real issues: the triangular/PERT schema permitted the degenerate
  `min === max` case that the elicitation fitter explicitly rejects
  (inconsistent; fixed by requiring `min < max` in the schema refine), and
  `validateTree()` had no check for duplicate node ids, which the data model
  relies on being unique for per-node history reconstruction across version
  snapshots (fixed by adding `validateUniqueIds()` in `lib/engine/validate.ts`).
  Added 3 regression tests (duplicate-id rejection, two min===max rejection
  cases). Reran lint, typecheck, the full suite (78 passed, 2 skipped), and
  `next build` — all clean. Phase 2 moved to `passed`.
- 2026-06-21: Implemented T1.2, T1.1, T1.3 together in worktree
  `../prediction-app-phase1` (branch `claude/phase1-auth-data-layer`), per
  user request to do a small batch of Phase 1 tickets in one PR (originally
  asked about Phase 3, but every Phase 3 ticket transitively depends on
  T1.3, which depends on T1.1/T1.2 — so did Phase 1 first).
  - T1.2: `lib/db/schema.ts` — `users`, `forecasts`, `forecast_versions`
    tables per BUILD_PLAN §5, including the circular
    `forecasts.currentVersionId` ↔ `forecast_versions.forecastId` FK
    (Drizzle's `.references()` callback resolves the circularity lazily).
    Generated `drizzle/0001_smiling_marvel_boy.sql`, applied it to the real
    Neon DB (T0.2's provisioned instance), and re-ran `db:migrate` to confirm
    idempotency. Updated `lib/db/migrations.test.ts`'s hardcoded
    `rows.length === 1` to read the journal length, since a second real
    migration now exists.
  - T1.1: chose GitHub OAuth after discussing options with the user (vs.
    email magic-link or credentials) — simplest for a single-user app, no
    extra service account needed. `auth.ts` wires Auth.js v5 with the GitHub
    provider and **JWT session strategy with no DB adapter** — deliberately
    skipped `@auth/drizzle-adapter` (already a dependency but unused) to
    avoid adding Auth.js's own accounts/sessions tables on top of the §5
    schema; instead the `jwt` callback upserts by email into our own `users`
    table once per sign-in and caches the id on the encrypted token.
    Discovered this Next.js version renamed `middleware.ts` to `proxy.ts`
    (per `node_modules/next/dist/docs/.../proxy.md`) — route protection
    lives in `proxy.ts`, with the redirect/401 decision logic factored into
    pure, unit-testable functions in `lib/auth/route-guard.ts` (avoids
    needing a real signed JWT in tests). `getCurrentUser()` added in
    `lib/auth/session.ts`. `AuthButton` (sign-in/out) added next to `Nav` in
    the root layout. **Not human-verified**: needs a GitHub OAuth App and
    `AUTH_SECRET` — `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`/`AUTH_SECRET` are
    still empty in `.env.local`.
  - T1.3: `lib/db/repository.ts` — `createForecast`, `getForecast`,
    `listForecasts`, `appendVersion`, `resolveForecast`, all scoped by
    `userId` (every mutation re-checks ownership via `getForecast` first and
    throws `ForecastNotFoundError` rather than ever returning another
    user's row). Reused T2.4's `TreeSchema` and the runner's internal
    `validateTree()` for tree validation rather than re-implementing it.
    Added `lib/validation/forecast.ts` for the forecast-metadata schema
    (title, cadence).
  - Verification: 107 tests pass (lib/db/schema.test.ts and
    lib/db/repository.test.ts run as real integration tests against the
    live Neon DB, like the existing T0.3 pattern), `npm run lint`,
    `npm run typecheck`, and `npm run build` all clean.
- 2026-06-21: Added T1.4 to the same PR/branch (user asked to fold it into
  the Phase 1 batch, then leave the PR open for Codex to review rather than
  merging). `lib/db/seed.ts` exports `seedDemoData()` — idempotent (checks
  for an existing demo user by email and an existing demo forecast by title
  before creating either), built on T1.3's repository functions so it
  exercises the same code path the app will use. `scripts/seed.ts` is the
  `npm run seed` CLI wrapper; ran it twice manually against the real Neon DB
  and confirmed the second run returned the same user/forecast ids (no
  duplicates). Pulled the inline test-user create/cleanup logic that had
  been duplicated across `schema.test.ts` and `repository.test.ts` into
  `lib/db/test-helpers.ts` (`createTestUser`/`deleteTestUsers`), satisfying
  the ticket's "test-DB setup/teardown helpers" requirement, and refactored
  both files to use it instead. Added `lib/db/seed.test.ts` as the harness
  self-test. Full suite now 108 tests, all passing against the live DB;
  lint/typecheck/build all still clean. Left PR #5 open (not merged) per
  the user's request, for Codex's independent Phase 1 review once T1.1 is
  human-verified.
