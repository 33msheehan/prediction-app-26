# Progress

This file is the lightweight coordination log for concurrent agent sessions.
`BUILD_PLAN.md` remains the source of truth for scope, and `tracker.html`
remains the formal dashboard.

## Current state

| Ticket | Status | Owner/session | Branch/worktree | Notes |
| --- | --- | --- | --- | --- |
| T0.1 | Done | prior session | main | Tooling scaffold is in place; tracker marks started/tests complete. |
| T0.2 | Done | prior session + user | main | Vercel Postgres provisioned, env vars pulled, /api/health verified live (200, db: connected) and integration test passes for real. |
| T0.3 | Done (pending human Neon-token verification) | claude session | claude/t0.3-orm-migrations (worktree: ../prediction-app-t0.3) | Drizzle wired; empty initial migration generated via `--custom`; `db:migrate` verified idempotent against the real provisioned DB (re-run added no duplicate `drizzle.__drizzle_migrations` rows). Skip-gated integration test added. Full ephemeral-Neon-branch CI verification still needs the user's Neon API token (T0.4-adjacent). |
| T0.4 | Not started | unassigned | — | CI pipeline. Good parallel task for a second agent. |
| T2.1 | Done | current session | codex/t2-engine | Added deterministic seedable RNG helpers in `lib/engine/rng.ts` with tests. |
| T2.2 | Done | current session | codex/t2-engine | Added distribution samplers in `lib/engine/distributions.ts` with validation and statistical tests. |

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
