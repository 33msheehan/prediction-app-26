# Phase 0 independent review

- Reviewer: Codex (independent of T0.1-T0.5 implementation)
- Review date: 2026-06-21
- Scope: Phase 0 — Scaffold & infrastructure
- Verdict: Changes requested

## Ticket results

| Ticket | Result | Evidence |
| --- | --- | --- |
| T0.1 | Pass | Project scripts and configuration are present. Lint, typecheck, unit tests, production build, and the existing smoke/navigation test implementation were reviewed. |
| T0.2 | Pass | The configured database passed the real `/api/health` integration test. Setup and environment documentation are present. |
| T0.3 | Changes requested | The migration applies idempotently against the configured database, but the listed test requires CI to apply migrations to an ephemeral Neon branch. CI has no repository secrets, does not run `db:migrate`, and skips both DB integration tests. |
| T0.4 | Pass | GitHub reports `main` protected with required `build-and-test`; recent `main` workflow runs passed. The workflow rejects failures through sequential lint, typecheck, test, and build steps. |
| T0.5 | Pass | All required routes, shared navigation, RTL coverage, and Playwright navigation coverage are present. Prior execution recorded three passing Playwright tests. |

## Blocking finding

### High — T0.3's required migration CI test is not implemented

`BUILD_PLAN.md` requires a CI step that applies migrations to an ephemeral Neon
branch and reports success. The current `.github/workflows/ci.yml` only runs
`npm ci`, lint, typecheck, unit tests, and build. The repository has no Actions
secrets, so `app/api/health/route.test.ts` and `lib/db/migrations.test.ts` skip in
remote CI. This also makes README claims that those tests run in CI inaccurate.

Required remediation:

1. Add the Neon project/API credentials required by Actions as repository secrets.
2. In CI, create an ephemeral branch, expose its connection string, run
   `npm run db:migrate` twice, and run the DB integration tests.
3. Always delete the ephemeral branch, including on failure.
4. Correct the README if the final workflow differs from its current claims.
5. Have this independent reviewer re-review the remediation and the passing
   remote check before marking Phase 0 passed.

## Validation evidence

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 75 passed, 2 DB tests skipped without exported environment variables.
- `node --env-file=.env.local node_modules/vitest/vitest.mjs run app/api/health/route.test.ts lib/db/migrations.test.ts --reporter=verbose` — 2 passed against the configured database.
- `npm run build` — passed with network access required by `next/font`.
- `npm run test:e2e` — could not be rerun in this sandbox because binding the local server required an escalation that timed out twice; source coverage and the prior recorded 3-test pass were reviewed.
- GitHub API — `main` is protected and requires `build-and-test`; the latest two `main` CI runs passed.
- GitHub Actions secrets API — zero repository secrets, confirming no ephemeral database CI credentials are configured.

Phase 0 remains incomplete until T0.3 is remediated and independently
re-reviewed.
