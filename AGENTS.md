<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project coordination rules

Multiple agents may work on this repository concurrently. Preserve other agents'
work and keep task scope tight.

## Task ownership

- Work from one ticket in `BUILD_PLAN.md` at a time.
- Record or announce the ticket id before editing.
- Do not expand ticket scope without user approval.
- Prefer one git worktree and one branch per ticket.
- Use branch names like `codex/<ticket-id>-short-name` unless the user asks for
  a different convention.

## Shared files

Treat these files as coordination-sensitive:

- `package.json`
- `package-lock.json`
- `README.md` (prose only — the `TRACKER:START`/`END` block is auto-generated)
- `BUILD_PLAN.md`
- `PROGRESS.md`
- test/build config files
- database schema and migration files

Before editing a coordination-sensitive file, inspect current contents and keep
the change minimal.

## Task tracker

- `BUILD_PLAN.md` is the scope source of truth.
- `PROGRESS.md` is the lightweight coordination log between sessions and the
  single source of all ticket/phase **status** (`progress` flags, `humanVerified`,
  phase review gates, the summary).
- `tracker.html` and the README `TRACKER` block are **generated artifacts** —
  never hand-edit or commit them on a feature branch. Reflect status changes by
  editing `BUILD_PLAN.md` (scope) and `PROGRESS.md` (status); run
  `npm run tracker:generate` locally only if you want to preview the dashboard.
  On `main`, CI regenerates and commits `tracker.html` + the README block
  automatically, so they always match the markdown without merge conflicts.
- Do not mark a ticket complete unless its acceptance criteria and listed tests
  are satisfied.
- If human verification is required, leave `humanVerified: false` and state what
  the user must verify.

## Independent phase review

A phase is not complete merely because every ticket in it is complete. Before a
phase is reported as complete, a different agent must review it.

- The implementing agent marks the phase `Ready for review` in `PROGRESS.md`
  after all phase tickets satisfy their acceptance criteria and tests.
- The implementing agent must not review or verify their own phase.
- The reviewer must not have implemented any ticket in that phase. If every
  available agent contributed to the phase, ask the user to designate an
  independent reviewer instead of weakening this rule.
- The reviewer reads the phase scope in `BUILD_PLAN.md`, inspects the merged
  diff and implementation, and reruns the phase-relevant tests plus lint,
  typecheck, and the full test suite where practical.
- The reviewer checks acceptance criteria, integration between tickets,
  regressions, security/data handling, and tracker accuracy. Review findings
  identify severity, file/location, and required remediation.
- Any material finding returns the phase to `Changes requested`. The original
  implementing agent fixes it; the independent reviewer then re-reviews.
- Only the independent reviewer may set a phase's review gate to `passed` in the
  `## Phase review gates` table of `PROGRESS.md` (which flows into
  `tracker.html`), recording their identity, date, and evidence there.
- `humanVerified` remains a separate ticket-level gate for actions or judgments
  only the project owner can perform. Independent agent review does not replace
  it.
