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
| T1.1   | x       | x                     | x              | Auth.js v5 wired with GitHub OAuth (`auth.ts`), JWT session strategy (no DB adapter — upserts into our own `users` table by email on first sign-in via the `jwt` callback), `getCurrentUser()` in `lib/auth/session.ts`. Route protection lives in `proxy.ts` (this Next.js version renamed `middleware.ts` to `proxy.ts`), with the redirect/401 decision logic factored into `lib/auth/route-guard.ts` for unit testing without a real JWT. `AuthButton` added to the layout for sign-in/out. 11 new tests pass; `next build` confirms the Proxy registers. Human-verified: user created GitHub OAuth Apps for both localhost and production, set `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`/`AUTH_SECRET`/`AUTH_URL` locally and in Vercel, redeployed, and confirmed the sign-in flow end-to-end in both environments.                                                                                                                                                                                                                                                                 |
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
| T3.1   | x       | x                     |                | Combined with T3.2 on the current branch. Added a server-side create flow for binary forecasts with cadence metadata, an immediate `source:'initial'` version, dashboard revalidation, and redirect into `/forecasts/[id]`. Form/validation/unit/build coverage is green locally, and the PR #10 independent review confirmed the DB-backed create/reload tests pass with a real `POSTGRES_URL`; GitHub Actions CI is green on that commit. |
| T3.2   | x       | x                     |                | Combined with T3.1 on the current branch. Dashboard now lists only the signed-in user's forecasts, shows latest headline probability, links into the forecast, and computes a due-for-review badge from cadence plus latest-version time. Cadence unit tests and RTL list coverage are green locally, and PR #10's independent review confirmed the DB-backed list-isolation assertions pass with a real `POSTGRES_URL`; GitHub Actions CI is green on that commit. |
| T3.3   | x       | x                     |                | Added a client-side tree editor shell on `/forecasts/[id]`: nested outline, rename/delete/reorder controls, node-type conversion (including root staying boolean), add-child type picker, expand/collapse, and live inline `validateTree()` feedback. Component tests cover rename/add/delete/move plus invalid type-change rejection; lint, typecheck, and `next build` are green locally. |
| T3.4   | x       | x                     |                | Added inline leaf editors for every v1 leaf type, including elicitation-driven parameter fitting and a distribution preview card with implied quantiles/yes-rate. Invalid inputs stay in the UI as recoverable errors instead of crashing the editor. Added focused coverage for leaf-preview math plus component tests covering elicitation edits and invalid draft handling; local lint, typecheck, full unit suite, and production build are green. |
| T3.5   | x       | x                     |                | Added composite-node configuration in the editor: `k_of_n` enforces `1 <= k <= n`, `threshold` edits `op` + `value`, and composite cards always surface their output type / accepted child type. Added component coverage for `k_of_n` constraint rejection alongside the existing structure-editor tests; local lint/typecheck/test/build are green. |
| T3.6   | x       | x                     |                | Added a debounced live headline panel in the editor using client-side `runForecast()`, with headline probability, SE, 95% CI, and invalid-tree guidance when recomputation is disabled. Added a component test that edits a leaf and verifies the debounced headline recompute plus CI display; local lint/typecheck/test/build are green. |
| T3.7   | x       | x                     |                | Added version persistence from the editor via `POST /api/forecasts/[id]/versions`, which appends `source:'edit'` versions through the repository layer and refreshes the page after save. Added route tests for the new endpoint's auth/404/400/200 branches; repository-level append/reload/invalid-tree coverage is also green when run with a real `POSTGRES_URL`, as confirmed in PR #10's independent review and green CI. |
| T3.8   | x       | x                     |                | Editor UX redesign on `claude/t3.8-editor-redesign`: master–detail editor with `tree`/`split`/`node` focus modes (persisted per-forecast in `localStorage`), nested-container structure pane with combine-rule badges + colored output rails + select/add/reorder/delete, pinned live headline, and a design-system foundation fix (semantic tokens, working dark mode, and the body-font bug where `globals.css` hardcoded Arial over the loaded Geist). Pure UI — engine/fitters/validation/repository/save endpoint untouched. Building-flow ergonomics added to cut clicks for deep trees: one-click typed-child chips (pick the type, node is created already-typed + selected — no separate type dropdown), auto-inserted valid starter child for fixed-arity composites (`threshold`/`not`), subtree duplicate, and inline rename (double-click) in the structure pane. A dev-only harness route `app/dev/editor` (404s in production, outside the proxy's protected prefixes) renders the editor with no auth/DB for interactive iteration + screenshots. Empty-canvas start: new forecasts are now created with **no initial version** (create flow uses `createForecast`, not `createForecastWithInitialVersion` — this changes T3.1's "persist an initial version" behavior), and the editor opens on a root chooser offering only boolean-output types (Yes/No, And, Or, Not, K-of-N, Threshold); the first save persists version 1. The forecast page renders the empty editor when there's no current version. Node choosers (root chooser, add-child chips, tree-row add menu) now show per-type icons (distribution silhouettes for leaves, logic/math glyphs for composites). `TreeEditorShell` tests rewritten/expanded for the select-then-edit model + empty-start (14 tests); full suite 132 passed / 14 skipped, lint/typecheck/build green. Verified in-browser in light + dark across all three focus modes. Still needs the human UX pass. |

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
| Phase 1 | passed        | Claude + Codex | 2026-06-21  | User confirmed Phase 1 received two independent LLM reviews and should now be treated as fully complete. The earlier Phase 1 PR-review findings (route-guard public-route prefix matching and proxy-layer test coverage gaps) were fixed before this status change; T1.1 remains human-verified and T1.2–T1.4 remained green against the real Neon DB at review time.                                                                                                                                                 |
| Phase 2 | passed        | Claude   | 2026-06-21  | Independently reviewed T2.1–T2.8 (implemented by Codex) against `BUILD_PLAN.md` §4: read all 8 `lib/engine` source files, verified all 9 leaf distributions, all 7 combinators, all 5 `validateTree()` rules, and the runner's analytic anchors. Found and fixed two issues on `codex/phase-2-independent-review`: (1) the triangular/PERT schema allowed `min === max` while the elicitation fitter rejected it — schema now requires `min < max`; (2) `validateTree()` had no duplicate-node-id check, which the data model relies on for per-node history reconstruction — added `validateUniqueIds()`. Added 3 regression tests. Reran lint, typecheck, full suite (78 passed, 2 skipped), and `next build` — all clean. |
| Phase 3 | pending       |          |             | Implementation and listed tests for T3.1-T3.7 are complete on PR #10. T3.8 (editor UX redesign) is now implemented and tested on `claude/t3.8-editor-redesign` and supersedes the editor look the human UX pass was waiting on. Independent re-review is still required, and the user still needs to perform the human UX verification (now against the redesigned editor).                                                                                                              |
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

Phases 0, 1, and 2 are complete. Phase 3 is implemented end to end on PR #10
(T3.1-T3.7: create/list/editor, leaf + composite editing, debounced live
headline, save-to-version). On top of that, T3.8 (a full editor UX redesign)
is implemented and tested on `claude/t3.8-editor-redesign`: a master–detail
editor with tree/split/node focus modes, a nested-container structure pane for
building 2–3 level trees, a pinned live headline, and a design-system/dark-mode
foundation fix. Lint, typecheck, the full unit suite (128 passed / 14 skipped),
and production build are green; verified in-browser in light + dark.

### Next steps

1. Open a PR for `claude/t3.8-editor-redesign` and have an independent agent
   review it alongside the existing PR #10 work.
2. Perform the human UX verification against the redesigned editor (the whole
   point of T3.8) before treating Phase 3 as fully closed.

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
- 2026-06-21: User confirmed T1.1's human-verification step: created
  GitHub OAuth Apps for both localhost and the Vercel production URL, set
  `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`/`AUTH_SECRET`/`AUTH_URL` in
  `.env.local` and in Vercel's production environment variables, redeployed,
  and confirmed the sign-in flow end-to-end in both environments. Marked
  T1.1 `humanVerified: true` and moved Phase 1's review gate from
  `not_ready` to `pending` — all four tickets are done and tested; the
  phase is now waiting on an independent reviewer (Codex) per
  `AGENTS.md`'s rule that the implementing agent can't review its own
  phase. PR #5 remains open, unmerged.
- 2026-06-21: Two PR review comments came in on `lib/auth/route-guard.ts`/
  `route-guard.test.ts`. Both addressed:
  - **[P1]** `isProtectedPath()`'s public-API exemption used
    `pathname.startsWith(prefix)` against `/api/health` and `/api/auth`,
    so `/api/healthcheck` and `/api/authors` were incorrectly treated as
    public (prefix match, not path-segment match). Fixed by reusing the
    same exact-or-slash-boundary `matchesPrefix()` helper the page-prefix
    check already used. Added a regression test
    (`/api/healthcheck`/`/api/authors` must stay protected).
  - **[P2]** The existing route-guard tests only covered the pure
    `decideAccess`/`isProtectedPath` functions, never the actual
    `proxy.ts` protection layer or Auth.js's `auth()` wrapper. Added
    `proxy.test.ts`: mocks `@/auth`'s `auth()` higher-order function to
    inject a controlled `req.auth` (avoiding the need for a real signed
    JWT cookie) while exercising proxy.ts's real switch statement and
    `NextResponse` construction — asserts the 307 redirect-to-sign-in
    (with `callbackUrl`), the 401 JSON body, and the `x-middleware-next`
    pass-through header for authed/public requests.
  - Verification: 114 tests pass (up from 108), lint/typecheck/build all
    clean. Pushed to PR #5, still open and unmerged, awaiting re-review.
- 2026-06-21: Began Phase 3 on the current branch by combining T3.1 + T3.2
  into one slice: added a server action-backed create-forecast flow with an
  immediate `source:'initial'` version, dashboard listing + due badge logic,
  and a forecast page that loads the current version. Local cadence/RTL tests,
  lint, typecheck, and `next build` passed. DB-backed repository tests for the
  new create/list paths were added but are not marked green yet because
  sourcing `.env.local` in this shell produced a live DB insert failure before
  the test bodies could execute.
- 2026-06-21: Pulled `origin/main` into the current branch per user request
  and updated Phase 1's review gate from `pending` to `passed` based on the
  user's confirmation that two independent LLM reviews had been completed.
- 2026-06-21: Completed T3.3 on `codex/t3.3-tree-editor-shell`. Added a
  client `TreeEditorShell` to `/forecasts/[id]` with nested outline editing,
  rename/delete/reorder controls, node-type conversion, add-child type
  selection, expand/collapse, and inline `validateTree()` feedback. Verified
  with 5 new RTL/user-event tests plus lint, typecheck, and `next build`.
