# Progress

This file is the lightweight coordination log for concurrent agent sessions.
`BUILD_PLAN.md` remains the source of truth for scope, and `tracker.html`
remains the formal dashboard.

## Current state

| Ticket | Status | Owner/session | Branch/worktree | Notes |
| --- | --- | --- | --- | --- |
| T0.1 | Done | prior session | main | Tooling scaffold is in place; tracker marks started/tests complete. |
| T0.2 | Done | prior session + user | main | Vercel Postgres provisioned, env vars pulled, /api/health verified live (200, db: connected) and integration test passes for real. |
| T0.3 | Changes requested | claude session | claude/t0.3-orm-migrations (merged) | Local migration workflow and real-DB idempotency pass, but the required ephemeral-Neon CI step is absent. See `reviews/phase-0-independent-review.md`. |
| T0.4 | Done | claude session + user | main | `.github/workflows/ci.yml` runs lint/typecheck/test/build on PRs + push to main. User pushed to `github.com/33msheehan/prediction-app-26`, enabled Actions, and added branch protection. Verified via GitHub API: `origin/main` exists, one CI run completed with `success`, `branches/main` reports `protected: true`. |
| T0.5 | Done | claude session | claude/t0.5-app-shell (worktree: ../prediction-app-t0.5) | Nav + layout, stub routes for /, /forecasts/new, /forecasts/[id], /forecasts/[id]/check-in, /calibration. RTL nav test + 2 real Playwright e2e tests (actual Chromium navigation) all pass. |
| T1.1 | Not started | unassigned | — | Authentication. Same stray-edit bug (from the T2.8 commit, `4822168`) had marked this done with no `lib/auth` implementation; corrected. |
| T2.1 | Done | current session | codex/t2-engine | Added deterministic seedable RNG helpers in `lib/engine/rng.ts` with tests. |
| T2.2 | Done | current session | codex/t2-engine | Added distribution samplers in `lib/engine/distributions.ts` with validation and statistical tests. |
| T2.3 | Done | current session | codex/t2.3-fitters | Added elicitation-to-param fitters in `lib/engine/fitters.ts` with empirical round-trip and invalid-input tests. |
| T2.4 | Done | current session | codex/t2.4-tree-schema | Added canonical tree types, recursive Zod schema, output-type helper, and traversal utilities in `lib/engine/tree.ts`. |
| T2.5 | Done | current session | codex/t2.5-combinators | Added composite evaluation helpers in `lib/engine/combinators.ts` with truth-table, arithmetic, and invalid-input tests. |
| T2.6 | Done | current session | codex/t2.6-tree-validation | Added `validateTree()` in `lib/engine/validate.ts` with path-based, human-readable errors for root type, arity, child typing, and param ranges. |
| T2.7 | Done | current session | codex/t2.7-runner | Added `runForecast()` in `lib/engine/runner.ts` with deterministic Monte Carlo evaluation, CI/SE aggregation, and optional numeric node summaries. |
| T2.8 | Done | current session | codex/t2.8-guardrails | Added runner trial/node guardrails and a representative default-run benchmark in `lib/engine/runner.ts`. |

## Phase review gates

Ticket completion makes a phase eligible for review; it does not complete the
phase. The reviewer must be an agent who implemented no ticket in that phase.

| Phase | Implementation | Independent review | Reviewer | Evidence / findings |
| --- | --- | --- | --- | --- |
| Phase 0 | Incomplete (T0.3) | Changes requested | Codex, 2026-06-21 | T0.1, T0.2, T0.4, and T0.5 pass review. T0.3 is missing its required ephemeral-Neon migration CI step; remote CI currently skips both DB tests. Full evidence: `reviews/phase-0-independent-review.md`. |
| Phase 1 | Not started | Not ready | — | Phase tickets are not complete. |
| Phase 2 | Ready for review | Pending | Unassigned independent agent | Review T2.1–T2.8 against `BUILD_PLAN.md`; inspect merged code and rerun lint, typecheck, full tests, and engine benchmarks. The implementing agent must not pass this gate. |
| Phase 3 | Not started | Not ready | — | — |
| Phase 4 | Not started | Not ready | — | — |
| Phase 5 | Not started | Not ready | — | — |
| Phase 6 | Not started | Not ready | — | — |
| Phase 7 | Not started | Not ready | — | — |
| Phase 8 | Not started | Not ready | — | — |

Review status vocabulary: `Not ready`, `Pending`, `In review`, `Changes
requested`, or `Passed`. A `Passed` entry must include reviewer identity, review
date, commands/tests run, and a concise result. Findings remain in this table or
the coordination log until re-review passes.

## Coordination rules

- Prefer separate git worktrees/branches per active ticket.
- Claim one ticket before editing.
- Avoid broad formatting changes.
- Avoid editing `tracker.html` from multiple sessions at once.
- Treat `package.json`, `package-lock.json`, `README.md`, `tracker.html`,
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
  `codex/t2-engine` and updated `tracker.html` to mark T2.1/T2.2 done.
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
  `tracker.html`.
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
  verifying, found the *same* stray-edit bug had also falsely marked T0.4
  done from the same commit — confirmed no `.github/` directory existed
  anywhere before this. Verified the real pipeline: deliberately broke
  typecheck (exit 2) and a test (exit 1), confirmed both fail and revert
  cleanly, then confirmed lint/typecheck/test/build all pass clean.
  `humanVerified` stays false — needs the user to push to GitHub, enable
  Actions, and add a branch protection rule.
- 2026-06-21: Full audit of `tracker.html` while merging `claude/t0.4-ci-pipeline`
  into `main`. Found the stray-edit bug had recurred *three more times* across
  the T2.7 and T2.8 commits (`c87c8ab`, `4822168`) — each time it re-flipped
  T0.5 and/or hit T1.1 instead of the ticket actually being worked on, and
  left T2.8 itself unmarked despite real benchmark/cap-enforcement code
  landing in `runner.ts`/`runner.test.ts`. Cross-checked every ticket marked
  `started: true` against actual files in the repo (not just trusting the
  flag): T0.1–T0.4 and T2.1–T2.8 are all genuinely done with real code/tests;
  T0.5 and T1.1 are genuinely not started. Corrected both and ran the full
  suite (74 tests pass) to confirm nothing else broke. Pattern to watch for:
  whoever edits `tracker.html` for a Tx.y ticket should double check the
  `id:` on the exact line being changed, not just the surrounding context.
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
  `protected: true`. (Couldn't check the exact required-check name without
  an auth token — that one detail is unverified, but protection + a green
  run together are strong evidence it's set up correctly.) Phase 0 is now
  fully implemented (T0.1–T0.5) and moved to "ready for review" under the
  same independent-review gate as Phase 2.
- 2026-06-21: Codex independently reviewed Phase 0. T0.1, T0.2, T0.4,
  and T0.5 passed. T0.3 returned to changes requested because its listed CI
  test is not implemented: `.github/workflows/ci.yml` never provisions an
  ephemeral Neon branch or runs `db:migrate`, the repository has no Actions
  secrets, and both DB tests skip remotely. Local lint, typecheck, 75 unit
  tests, production build, and both real-DB integration tests passed. Phase 0
  remains incomplete pending remediation and re-review; see
  `reviews/phase-0-independent-review.md`.
