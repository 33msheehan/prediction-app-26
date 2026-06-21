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
- `README.md`
- `tracker.html`
- test/build config files
- database schema and migration files

Before editing a coordination-sensitive file, inspect current contents and keep
the change minimal.

## Task tracker

- `BUILD_PLAN.md` is the scope source of truth.
- `PROGRESS.md` is the lightweight coordination log between sessions.
- `tracker.html` is the formal ticket dashboard.
- Update `tracker.html` only when a ticket materially changes state.
- Keep `SUMMARY`, `LAST_UPDATED`, and the relevant ticket `progress` flags in
  `tracker.html` in sync.
- Do not mark a ticket complete unless its acceptance criteria and listed tests
  are satisfied.
- If human verification is required, leave `humanVerified: false` and state what
  the user must verify.
