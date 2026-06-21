# Forecast Workbench — Build Plan

> A personal, single-user web app for disciplined probabilistic forecasting, inspired by Tetlock's *Superforecasting*. The user takes a future event, decomposes it into a tree of sub-events, models each leaf with a probability distribution, and the app Monte-Carlo–samples the tree to produce a calibrated headline probability. Forecasts are **living**: the user revisits them on a self-chosen cadence, the app coaches disciplined incremental updates, and once events resolve it scores the user's calibration over time.

**Codename:** `Forecast Workbench` (placeholder — rename freely).
**Audience for this doc:** a Claude code agent building the app from scratch, plus the project owner (Michael) reviewing progress.

---

## 1. Scope — what v1 is and is not

This is the single source of truth for scope. Tickets must not silently exceed it.

### In scope (v1)

- **Single-user, personal tool.** Auth exists and the data layer is multi-tenant-safe (no cross-user leakage), but there is no sharing, no teams, no aggregation.
- **Binary forecasts only.** The root of every forecast tree evaluates to a boolean per trial; the headline is a probability `p ∈ [0, 1]`. (Categorical/multi-outcome is *designed for* but **not built** — see Backlog.)
- **Guided tree decomposition.** A nested, typed tree of nodes. No free-form expression language, no graphical canvas. An indented outline editor.
- **Distribution leaves** elicited in human terms (quantiles / three-point), not raw parameters.
- **Monte Carlo engine**, pure TypeScript, runs client-side. Independence assumption: every leaf is sampled independently per trial. Sampling is the single seam where correlation can later be injected without touching node definitions.
- **Living forecasts:** append-only version history (the belief timeline), user-defined check-in cadence, and **update discipline** — the app flags large jumps and asks for a rationale, nudging incremental change.
- **Manual resolution** (binary outcome: happened / did not happen).
- **Calibration loop:** Brier + log score, a reliability diagram, and trajectory of accuracy across resolved forecasts.
- **Co-pilot scaffold only:** the secure server-side LLM path (Claude API) is built and auth-gated, with a stubbed "suggest decomposition" endpoint behind a feature flag. **No real co-pilot product features yet** — they slot in later once the core UX is felt.
- **Responsive web (PWA-ready).** Installable on mobile browsers.

### Explicitly out of scope (v1) → Backlog

- Categorical / >2-outcome questions (case/switch composition).
- Correlation / dependence between sub-events (copulas, shared latent factors).
- Sensitivity ranking ("which node moves the headline most").
- Automated / LLM-driven resolution for public events.
- Full co-pilot features (decomposition suggestions, base-rate research, distribution fitting from prose).
- Crowd / multi-forecaster aggregation.
- Background notifications / email reminders (v1 surfaces "due for review" in-app only).
- Native desktop/mobile wrappers (Electron/Capacitor/RN).

---

## 2. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One repo gives React UI **and** serverless API routes; first-class Vercel deploy. |
| Hosting | **Vercel** | Owner's stated preference; zero-config deploys, preview envs. |
| Database | **Vercel Postgres** (Neon under the hood) | Owner's stated preference; serverless Postgres scales fine for a personal tool and well beyond. Neon branching gives ephemeral test DBs. |
| ORM / migrations | **Drizzle ORM** | TypeScript-native schema + type-safe queries, edge/serverless-friendly, lightweight migrations. (Prisma is an acceptable alternative if the agent prefers; pick one and stay consistent.) |
| Auth | **Auth.js (NextAuth v5)** | Simple, self-hosted, route protection. Single provider (email/credentials or GitHub) is enough. (Clerk acceptable if faster.) |
| Server state | **TanStack Query** + Next.js Route Handlers / Server Actions | Predictable caching/invalidation for forecast data. |
| Charts | **Recharts** | Fast to build histograms, the belief-over-time line, and the reliability diagram. |
| RNG | **Seedable PRNG** (e.g. `seedrandom` or a vendored `mulberry32`) | Deterministic, reproducible sims → testable, no UI jitter. |
| Validation | **Zod** | Runtime validation of the tree + node params; shared types front/back. |
| Unit tests | **Vitest** | Fast, TS-native; statistical assertions on samplers. |
| Component tests | **React Testing Library** | Editor interaction tests. |
| E2E | **Playwright** | Golden-path coverage. |
| CI | **GitHub Actions** | Lint + typecheck + test on every PR. |
| LLM | **Anthropic Claude API** via a server-only route | Key never reaches the client; user-scoped. |

**Architectural seams to preserve (do not violate):**
1. **The Monte Carlo engine is a pure library** (`/lib/engine`) with no React, no DB, no network. It takes a `Tree` + config and returns a result. This makes it exhaustively unit-testable and reusable.
2. **Sampling is the only place leaves are drawn.** Correlation is added later by swapping the sampler, never by changing node schemas.
3. **All LLM calls go through a server route** that injects the key and the authenticated user; the client never holds credentials or another user's data.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────┐
│ Next.js app (Vercel)                                     │
│                                                          │
│  Client (React, TS)                                      │
│   • Dashboard / forecast list (+ "due for review")       │
│   • Forecast editor → tree outline + live headline       │
│   • Node editor (leaf: distribution + elicitation        │
│        preview; composite: combinator config)            │
│   • Check-in flow (+ update-discipline guardrails)       │
│   • Forecast detail (trajectory chart, resolve)          │
│   • Calibration dashboard (reliability diagram, scores)  │
│         │                                                │
│         │ imports (pure, runs in browser)                │
│         ▼                                                │
│   /lib/engine  ── samplers, fitters, combinators, runner │
│                                                          │
│  Server (Route Handlers / Server Actions)                │
│   • Forecast/version/resolution CRUD  ──► Drizzle ──► DB │
│   • /api/llm/*  (auth-gated Claude proxy, stub)          │
│   • Auth.js                                              │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Core domain model — the Tree specification

This is the technical heart. Get this right and the rest follows.

### 4.1 Output types

Every node produces one of two **output types** per trial:
- `boolean`
- `numeric`

The **root must be `boolean`** in v1.

### 4.2 Node kinds & types

**Leaf nodes** (random inputs — sample a distribution):

| `type` | Output | Params (post-fit) | Elicitation input |
|---|---|---|---|
| `bernoulli` | boolean | `{ p }` | a probability slider `p` |
| `binomial` | numeric | `{ n, p }` | `n`, `p` |
| `poisson` | numeric | `{ lambda }` | "expected count" = `lambda`, or a quantile |
| `normal` | numeric | `{ mu, sigma }` | quantiles `P10, P50, P90` |
| `lognormal` | numeric | `{ muLog, sigmaLog }` | quantiles `P10, P50, P90` (positive) |
| `beta` | numeric ∈ [0,1] | `{ alpha, beta }` | mean + concentration, or pseudo-counts (successes/failures), or two quantiles |
| `uniform` | numeric | `{ a, b }` | `a`, `b` |
| `triangular` | numeric | `{ min, mode, max }` | three-point |
| `pert` | numeric | `{ min, mode, max }` | three-point (smoother) |

**Composite nodes** (deterministic functions of children — evaluated per trial):

| `type` | Children | Output | Notes |
|---|---|---|---|
| `and` | ≥1 boolean | boolean | all true |
| `or` | ≥1 boolean | boolean | any true |
| `not` | exactly 1 boolean | boolean | negation |
| `k_of_n` | ≥1 boolean | boolean | param `k`; true iff ≥ k children true |
| `count_true` | ≥1 boolean | numeric | how many children are true |
| `sum` | ≥1 numeric | numeric | arithmetic sum |
| `threshold` | exactly 1 numeric | boolean | params `op ∈ {≥,>,≤,<,==}`, `value` |

This vocabulary is deliberately small but complete enough to express most Fermi-ized binary questions (e.g. *"≥3 of these 5 approvals AND time-to-launch < deadline"*).

### 4.3 Tree validation rules (typed ports)

A tree is **valid** iff:
1. Exactly one root; root output type is `boolean`.
2. Every composite's children match its required input type (e.g. `and` rejects a `numeric` child; wire a `threshold` in between).
3. Arity constraints hold (`not` and `threshold` have exactly one child; `k_of_n` has `1 ≤ k ≤ n`).
4. No cycles (it's a tree; enforced structurally by parent pointers).
5. All distribution params are finite and in valid ranges (`sigma > 0`, `0 ≤ p ≤ 1`, `min ≤ mode ≤ max`, `alpha,beta > 0`, etc.).

Validation runs (a) live in the editor (block invalid wiring with a clear message) and (b) server-side before persisting a version.

### 4.4 Canonical TypeScript shape (illustrative)

```ts
type OutputType = 'boolean' | 'numeric';

type NodeId = string; // stable UUID, persists across versions

interface BaseNode {
  id: NodeId;
  label: string;
  children: TreeNode[]; // empty for leaves
}

type LeafNode = BaseNode & {
  kind: 'leaf';
  type: 'bernoulli' | 'binomial' | 'poisson' | 'normal'
      | 'lognormal' | 'beta' | 'uniform' | 'triangular' | 'pert';
  params: Record<string, number>;       // fitted params
  elicitation?: Record<string, number>; // what the user actually typed (kept for editing)
};

type CompositeNode = BaseNode & {
  kind: 'composite';
  type: 'and' | 'or' | 'not' | 'k_of_n' | 'count_true' | 'sum' | 'threshold';
  config?: { k?: number; op?: '>=' | '>' | '<=' | '<' | '=='; value?: number };
};

type TreeNode = LeafNode | CompositeNode;
type Tree = { root: TreeNode };
```

Node `id`s are **stable UUIDs** so per-node history can be reconstructed by matching ids across version snapshots.

---

## 5. Database schema (Drizzle)

Append-only versioning is the spine: the **entire tree** is snapshotted on every save/check-in, giving us the belief timeline for free and a clean diff target for update discipline.

```ts
// users
id            uuid pk
email         text unique
createdAt     timestamptz default now()

// forecasts  (metadata + current pointer + resolution)
id              uuid pk
userId          uuid fk -> users.id
title           text
description      text
questionType    text  // 'binary' (only value in v1; column future-proofs categorical)
status          text  // 'open' | 'resolved'
cadenceKind     text  // 'none' | 'interval' | 'dates'
cadenceInterval integer null      // days, when kind='interval'
cadenceDates    jsonb null        // ISO date[] when kind='dates'
currentVersionId uuid null fk -> forecast_versions.id
resolvedOutcome boolean null      // true/false at resolution (binary)
resolvedAt      timestamptz null
resolutionNotes text null
createdAt       timestamptz default now()
updatedAt       timestamptz

// forecast_versions  (append-only snapshots = the timeline)
id            uuid pk
forecastId    uuid fk -> forecasts.id
versionNo     integer            // monotonic per forecast
tree          jsonb              // full Tree snapshot
headlineP     double precision   // computed headline at save time
headlineSE    double precision   // Monte Carlo standard error
trials        integer            // N used
source        text               // 'initial' | 'edit' | 'checkin'
rationale     text null          // why this change (required on large moves)
createdAt     timestamptz default now()
```

Indexes: `forecasts(userId, status)`, `forecast_versions(forecastId, versionNo)`.

**Derived, not stored:** "next due" (computed from cadence + last version time), per-node history (filter each version's `tree` jsonb for a given node id), scores (computed from versions + resolution).

> Subevent-level history is available because node ids are stable across snapshots; subevent *scoring* is an optional later step and only meaningful for sub-events that are themselves resolvable.

---

## 6. Monte Carlo engine specification

Pure library in `/lib/engine`. No React, DB, or network.

### 6.1 Sampling primitives & distributions

- **RNG:** seedable PRNG; all randomness flows through it (no bare `Math.random`).
- **Inverse-CDF / standard algorithms per distribution:**
  - `bernoulli(p)`: `rng() < p`.
  - `binomial(n,p)`: sum of `n` Bernoulli (fine for the small `n` this app sees).
  - `poisson(λ)`: Knuth's multiplication method (adequate for the `λ` ranges expected; note the limitation in code).
  - `normal(μ,σ)`: Box–Muller.
  - `lognormal(μ_log,σ_log)`: `exp(normal(μ_log,σ_log))`.
  - `beta(α,β)`: via two Gamma draws, `G(α)/(G(α)+G(β))` (Marsaglia–Tsang for Gamma).
  - `uniform(a,b)`, `triangular(min,mode,max)` (inverse-CDF), `pert(min,mode,max)` (scaled Beta, shapes below).

### 6.2 Elicitation → parameter fitting

- **Normal from `P10,P50,P90`:** `μ = P50`, `σ = (P90 − P10) / (2 × 1.2816)` (1.2816 = z₀.₉). Warn if quantiles are strongly asymmetric (symmetric fit assumed in v1).
- **Lognormal from `P10,P50,P90`:** fit Normal in log space — `μ_log = ln(P50)`, `σ_log = (ln P90 − ln P10) / (2 × 1.2816)`. Require all > 0.
- **Triangular / PERT from `min,mode,max`:** direct. PERT shapes: `α = 1 + 4(mode−min)/(max−min)`, `β = 1 + 4(max−mode)/(max−min)`, sampled as a Beta scaled to `[min,max]`.
- **Beta from mean `m` + concentration `ν`:** `α = mν`, `β = (1−m)ν`. From pseudo-counts `(s,f)`: `α = s+1, β = f+1` (or raw `s,f`). Two-quantile fit is an enhancement (numeric solve).
- **Poisson:** `λ` = expected count directly; quantile-based fit optional.

Every fitter has a **round-trip test**: fit from elicitation → sample heavily → recover the input quantiles within tolerance.

### 6.3 The runner

```
runForecast(tree, { trials = 10_000, seed }) -> {
  p,            // fraction of trials where root === true
  se,           // sqrt(p*(1-p)/trials)
  ci95,         // [p - 1.96*se, p + 1.96*se], clamped to [0,1]
  trials,
  nodeSummaries // optional: per numeric node, {mean, p10, p50, p90}
}
```

Per trial: depth-first, sample each leaf via RNG, evaluate composites bottom-up, read root boolean. Aggregate.

### 6.4 Correctness anchors (used as tests — these have exact analytic answers)

- `bernoulli(0.3)` → `p ≈ 0.30` within `3·SE` at `N=100k`.
- `and(bernoulli(0.5), bernoulli(0.5))` indep → `0.25`.
- `or(bernoulli(0.5), bernoulli(0.5))` → `0.75`.
- `k_of_n(k=2, [b(0.5)×3])` → `P(≥2 of 3) = 0.5`.
- `threshold(poisson(3) ≥ 2)` → `1 − 4e⁻³ ≈ 0.8009`.

### 6.5 Guardrails

Cap `trials` (e.g. ≤ 100k) and node count (e.g. ≤ 200) for v1; benchmark a representative tree to confirm sub-100ms headline recompute in-browser.

---

## 7. How the agent should execute this plan

1. **One branch + PR per ticket.** PR title = ticket id + name.
2. **A ticket is "done" only when:** all its acceptance criteria pass, its listed tests are written and green, `lint` + `typecheck` + full test suite pass in CI, and no scope creep beyond the ticket.
3. **A phase is "done" only after independent review.** Once every ticket in a phase is done, mark the phase ready for review. An agent who implemented no ticket in that phase must review the merged implementation against the phase scope, acceptance criteria, tests, integration boundaries, and tracker state. That reviewer records evidence and either passes the phase or requests changes; an implementing agent cannot verify their own phase.
4. **Follow the dependency order.** Phase 2 (the engine) is pure and independent of the DB/auth — it can be built first or in parallel and is the highest-leverage thing to land early.
5. **Vertical slice target:** Phases 0 → 1 → 2 → 3 produce a usable "create a forecast and see a probability" app. Ship that, then 4 → 5 → 6.
6. **Keep a checklist** at the top of the repo (`PROGRESS.md`) ticking off ticket ids and phase reviews.
7. **Never commit secrets.** `ANTHROPIC_API_KEY`, DB URLs → env only.
8. When a ticket says "test X," write the *specific* test, not a placeholder.

---

## 8. Phases & tickets

Each ticket: **Goal · Implementation · Acceptance criteria · Tests · Depends on.**

### Phase 0 — Scaffold & infrastructure

**T0.1 — Initialise project & tooling**
- *Goal:* Working Next.js + TS repo with linting, formatting, and test runners wired.
- *Implementation:* `create-next-app` (App Router, TS); add ESLint, Prettier, Vitest, RTL, Playwright; npm scripts `dev/build/lint/typecheck/test/test:e2e`.
- *Acceptance:* `npm run dev` serves a placeholder page; `lint`, `typecheck`, `test` all run and pass on an empty smoke test.
- *Tests:* one trivial Vitest smoke test; one Playwright test that loads `/` and asserts a heading.
- *Depends on:* —
- *Human:* —

**T0.2 — Vercel project & Postgres provisioning**
- *Goal:* Deployable skeleton with a connected database.
- *Implementation:* Create Vercel project; provision Vercel Postgres; wire env vars locally (`.env.local`) and in Vercel; document in `README`.
- *Acceptance:* App deploys to a Vercel preview URL; a `/api/health` route returns `{ ok: true, db: 'connected' }` after a trivial `SELECT 1`.
- *Tests:* integration test hitting `/api/health` against a test DB returns db-connected.
- *Depends on:* T0.1
- *Human:* Requires logging into Vercel/Neon to create the project and database and supplying the connection string — accounts and credentials only you hold.

**T0.3 — ORM & migrations**
- *Goal:* Drizzle configured with migration workflow.
- *Implementation:* Install Drizzle + driver; config; `db:generate` / `db:migrate` scripts; empty initial migration.
- *Acceptance:* Running migrations against a fresh DB succeeds and is idempotent.
- *Tests:* CI step applies migrations to an ephemeral Neon branch and reports success.
- *Depends on:* T0.2
- *Human:* Provisioning a Neon API token (your account) was needed to create/destroy a real ephemeral branch for verification.

**T0.4 — CI pipeline**
- *Goal:* PRs gated on quality.
- *Implementation:* GitHub Actions: install, `lint`, `typecheck`, `test`, build; (optionally `test:e2e` on a schedule).
- *Acceptance:* A PR with a failing test/types is blocked; a clean PR passes.
- *Tests:* the pipeline itself (verify a deliberately broken branch fails).
- *Depends on:* T0.1
- *Human:* Needed your GitHub account to push the repo, enable Actions, and set branch protection — verified via the GitHub API: origin/main exists, one CI run completed successfully, and main reports protected: true.

**T0.5 — App shell & routing skeleton**
- *Goal:* Navigable empty screens.
- *Implementation:* Layout, nav, and stub routes: `/` (dashboard), `/forecasts/new`, `/forecasts/[id]`, `/forecasts/[id]/check-in`, `/calibration`.
- *Acceptance:* All routes render a titled placeholder; nav links work.
- *Tests:* RTL renders layout with nav; Playwright navigates between routes.
- *Depends on:* T0.1
- *Human:* —

### Phase 1 — Auth & data layer

**T1.1 — Authentication**
- *Goal:* Logged-in, user-scoped app.
- *Implementation:* Auth.js with one provider; protect all `/forecasts/*`, `/calibration`, `/api/*` (except health); expose `getCurrentUser()` server helper.
- *Acceptance:* Unauthed access to protected routes redirects to sign-in; authed user has a stable id.
- *Tests:* integration tests: protected route 401/redirect when unauthed; succeeds when authed (mocked session).
- *Depends on:* T0.5
- *Human:* Choosing/creating the OAuth provider (e.g. a GitHub OAuth app) and supplying its client id/secret requires your accounts and decisions.

**T1.2 — Schema & migrations (users, forecasts, versions)**
- *Goal:* Persisted domain model from §5.
- *Implementation:* Drizzle tables for `users`, `forecasts`, `forecast_versions`; migration; indexes.
- *Acceptance:* Tables created; FKs enforced; can insert/select a forecast + version by hand.
- *Tests:* DB tests: insert user→forecast→version; FK violation rejected; `versionNo` uniqueness per forecast.
- *Depends on:* T0.3, T1.1
- *Human:* —

**T1.3 — Data-access layer + shared types**
- *Goal:* Type-safe, user-scoped CRUD.
- *Implementation:* Repository functions (`createForecast`, `getForecast`, `listForecasts`, `appendVersion`, `resolveForecast`) **always filtered by `userId`**; Zod schemas for `Tree` and all node params (shared front/back).
- *Acceptance:* No repository function can return another user's data; tree Zod schema rejects malformed trees (bad type, bad arity).
- *Tests:* unit tests for Zod tree validation (valid + each invalid case from §4.3); repo tests confirming user isolation.
- *Depends on:* T1.2
- *Human:* —

**T1.4 — Seed & DB test harness**
- *Goal:* Reproducible local/test data.
- *Implementation:* Seed script creating a demo user + one sample binary forecast with a small tree; test-DB setup/teardown helpers (Neon branch or local Postgres).
- *Acceptance:* `npm run seed` populates a runnable example; tests can spin a clean DB.
- *Tests:* harness self-test (seed → query → assert shape).
- *Depends on:* T1.3
- *Human:* —

### Phase 2 — Probabilistic core (pure, client-side; build early)

> Independent of Phases 0–1. Highest-value, most testable. Lives in `/lib/engine`.

**T2.1 — Seedable RNG & sampling utilities**
- *Goal:* Deterministic randomness.
- *Implementation:* Wrap a seedable PRNG; helper to create independent streams; ban bare `Math.random` via lint rule.
- *Acceptance:* Same seed → identical sequence; different seeds → different.
- *Tests:* determinism test; basic uniformity sanity (mean ≈ 0.5 over large N).
- *Depends on:* T0.1
- *Human:* —

**T2.2 — Distribution samplers**
- *Goal:* All nine distributions in §4.2.
- *Implementation:* Implement each per §6.1; document algorithm limits in code (e.g. Poisson/Knuth).
- *Acceptance:* Each sampler's empirical mean/variance match theory within tolerance at large N.
- *Tests:* per-distribution statistical tests (seeded): assert mean & variance within `±` tolerance; range constraints (Beta ∈ [0,1], Poisson ∈ ℤ≥0, etc.).
- *Depends on:* T2.1
- *Human:* —

**T2.3 — Elicitation → parameter fitters**
- *Goal:* Human inputs → fitted params (§6.2).
- *Implementation:* Normal/Lognormal quantile fit; Triangular/PERT 3-point; Beta (mean+ν, pseudo-counts); Poisson.
- *Acceptance:* Fitting then sampling recovers the input quantiles within tolerance; invalid inputs (e.g. `P10 > P90`, `mode` outside `[min,max]`) throw clear errors.
- *Tests:* round-trip tests per fitter; invalid-input tests.
- *Depends on:* T2.2
- *Human:* —

**T2.4 — Tree types & Zod schema**
- *Goal:* Canonical `Tree` representation (§4.4).
- *Implementation:* Types + Zod schema; helpers (`computeOutputType(node)`, traversal).
- *Acceptance:* Output type of every node type computed correctly.
- *Tests:* output-type tests across all node types.
- *Depends on:* T0.1
- *Human:* —

**T2.5 — Combinator evaluation**
- *Goal:* Deterministic per-trial evaluation of composites (§4.2).
- *Implementation:* `and/or/not/k_of_n/count_true/sum/threshold`.
- *Acceptance:* Exact truth-table / arithmetic behaviour.
- *Tests:* truth tables for boolean combinators; `k_of_n` boundary cases; `threshold` for each operator; `sum`/`count_true` arithmetic.
- *Depends on:* T2.4
- *Human:* —

**T2.6 — Tree validation**
- *Goal:* Enforce §4.3.
- *Implementation:* `validateTree(tree) -> {valid, errors[]}` checking root-boolean, child-type matching, arity, param ranges.
- *Acceptance:* Every invalid case yields a specific, human-readable error; valid trees pass.
- *Tests:* one test per validation rule (pass + fail).
- *Depends on:* T2.4, T2.5
- *Human:* —

**T2.7 — Monte Carlo runner**
- *Goal:* `runForecast` (§6.3).
- *Implementation:* DFS sample + evaluate; aggregate `p`, `se`, `ci95`; optional `nodeSummaries`.
- *Acceptance:* Matches all analytic anchors in §6.4 within `3·SE`; reproducible under fixed seed.
- *Tests:* the §6.4 anchor suite; determinism test; a multi-level mixed tree against an independently computed expectation.
- *Depends on:* T2.2, T2.3, T2.5, T2.6
- *Human:* —

**T2.8 — Performance guardrails & benchmark**
- *Goal:* Keep it snappy (§6.5).
- *Implementation:* Cap `trials`/node count; micro-benchmark a representative tree.
- *Acceptance:* Representative headline recompute < 100ms in a browser-like env at default N.
- *Tests:* benchmark test asserting a time budget; cap-enforcement tests.
- *Depends on:* T2.7
- *Human:* —

### Phase 3 — Forecast CRUD & tree editor

**T3.1 — Create-forecast flow**
- *Goal:* Make a new binary forecast.
- *Implementation:* Form: title, description, (binary fixed for v1), cadence config (none / interval-days / specific-dates); persist an initial empty-ish forecast + `source:'initial'` version.
- *Acceptance:* Submitting creates a forecast owned by the user and lands on its editor.
- *Tests:* integration (creation persists, user-scoped); component test for the form; cadence validation tests.
- *Depends on:* T1.3, T0.5
- *Human:* —

**T3.2 — Dashboard / forecast list**
- *Goal:* See and open forecasts; spot what needs review.
- *Implementation:* List of the user's forecasts with headline, status, and a **"due for review"** badge computed from cadence + latest version time.
- *Acceptance:* Only the user's forecasts show; overdue ones are flagged; clicking opens the forecast.
- *Tests:* due-ness computation unit tests (interval & date-based, edge cases); RTL list rendering; user-isolation test.
- *Depends on:* T3.1
- *Human:* —

**T3.3 — Tree editor shell (outline)**
- *Goal:* Build/edit the tree structure.
- *Implementation:* Nested indented outline; add child (choose leaf/composite + type), rename, delete, reorder; expand/collapse; live `validateTree` feedback inline.
- *Acceptance:* Can construct an arbitrary valid tree; invalid wiring is blocked with a clear message; root stays boolean.
- *Tests:* component tests for add/delete/move/rename; invalid-wiring rejection test.
- *Depends on:* T2.4, T2.6, T3.1
- *Human:* Outline-editor feel (drag/reorder, clarity of inline validation messages) is a UX judgment call worth your eyes.

**T3.4 — Leaf node editor + distribution preview**
- *Goal:* Configure a distribution in human terms and *see* it.
- *Implementation:* Per leaf type, the right elicitation inputs (quantiles / three-point / p / pseudo-counts); on change, fit params and render a **histogram preview** + implied `P10/P50/P90`.
- *Acceptance:* Editing inputs updates the preview; implied quantiles match the fitter; bad inputs show errors, not crashes.
- *Tests:* component tests per leaf type; preview reflects fitted params; error-state tests.
- *Depends on:* T2.3, T3.3
- *Human:* This is the 'good-habits' feature — whether the preview actually makes you confront your tails is your call, not a unit test's.
- *(Good-habits feature: the preview forces the user to confront what their numbers actually imply about the tails.)*

**T3.5 — Composite node editor**
- *Goal:* Configure combinators.
- *Implementation:* For `k_of_n` set `k`; for `threshold` set `op` + `value`; others need only children. Show output type.
- *Acceptance:* Config persists into the tree; `k_of_n` enforces `1 ≤ k ≤ n`; `threshold` requires a numeric child.
- *Tests:* component tests; constraint tests.
- *Depends on:* T3.3
- *Human:* —

**T3.6 — Live headline in editor**
- *Goal:* Immediate feedback as the model changes.
- *Implementation:* On any valid edit, run `runForecast` (debounced) client-side; show `p` as a percentage with the **±SE / 95% CI**; disable/grey when tree invalid.
- *Acceptance:* Headline updates within the debounce window; CI shown; invalid tree shows guidance not a number.
- *Tests:* component test (edit → headline changes); CI displayed; invalid-state handling.
- *Depends on:* T2.7, T3.3, T3.4, T3.5
- *Human:* Whether the debounce/recompute actually feels snappy in a real browser is worth confirming yourself.

**T3.7 — Persist version (save)**
- *Goal:* Save the tree as an immutable version with its computed headline.
- *Implementation:* "Save" appends a `forecast_versions` row (`tree`, `headlineP`, `headlineSE`, `trials`, `source:'edit'`); update `currentVersionId`; reload latest on open.
- *Acceptance:* Saving creates exactly one new version; reopening shows the latest tree + headline; server re-validates the tree before insert.
- *Tests:* integration (save → version row with correct headline within tolerance; server rejects invalid tree); reload test.
- *Depends on:* T1.3, T3.6
- *Human:* —

### Phase 4 — Living forecasts: check-ins, history, update discipline

**T4.1 — Version history wiring**
- *Goal:* Expose the append-only timeline.
- *Implementation:* Query all versions for a forecast (ordered); derive headline trajectory + change points.
- *Acceptance:* Returns versions in order with headline + timestamp + source + rationale.
- *Tests:* repo test (ordering, completeness); user-isolation test.
- *Depends on:* T3.7
- *Human:* —

**T4.2 — Belief-over-time chart**
- *Goal:* Visualise how the forecast moved.
- *Implementation:* Recharts line of `headlineP` vs `createdAt`; markers for check-ins; hover shows rationale.
- *Acceptance:* Chart reflects stored versions; check-in points distinguishable; empty/single-point states handled.
- *Tests:* component test with fixture versions; empty-state test.
- *Depends on:* T4.1
- *Human:* You're colorblind — worth confirming check-in markers are distinguishable by shape/position, not just color, same principle as this tracker.

**T4.3 — Cadence engine**
- *Goal:* Drive "when to revisit."
- *Implementation:* Pure `nextDue(forecast, lastVersionAt)` for `none` / `interval` / `dates`; dashboard surfaces overdue (reuses T3.2 badge).
- *Acceptance:* Correct next-due for each cadence kind; dates in the past flagged overdue; `none` never due.
- *Tests:* exhaustive unit tests (interval rollover, multiple dates, past/future, timezone-safe comparisons).
- *Depends on:* T3.1
- *Human:* —

**T4.4 — Check-in flow**
- *Goal:* Structured re-evaluation.
- *Implementation:* From a due forecast, open a check-in: show current tree + current headline; let the user adjust node params/values; recompute live; entry point logs `source:'checkin'`.
- *Acceptance:* User can revise any leaf; live headline recomputes; cancelling makes no version.
- *Tests:* component/integration: adjust → recompute → save creates a `checkin` version; cancel creates none.
- *Depends on:* T3.4, T3.6, T4.3
- *Human:* —

**T4.5 — Update-discipline guardrails**
- *Goal:* Discourage wild swings, encourage incremental updates.
- *Implementation:* On save during a check-in, compute `Δ = newHeadline − prevHeadline`; if `|Δ| > threshold` (configurable; default 0.15) show a **"large move"** prompt requiring a `rationale` before saving; always display **prior beside proposed** and the step size; (lightweight) if a rationale mentions new evidence but `|Δ|` is tiny, surface a gentle "are you under-reacting?" note.
- *Acceptance:* Large moves cannot be saved without a rationale; small moves save freely; prior/proposed both shown; threshold configurable.
- *Tests:* unit tests on the threshold/diff logic; component test (large move blocks save until rationale; small move doesn't); persistence of rationale.
- *Depends on:* T4.4, T4.1
- *Human:* Whether the large-move prompt feels like useful friction (vs annoying) is a product-feel judgment only you can make.

**T4.6 — Rationale capture & display**
- *Goal:* Make the reasoning trail first-class.
- *Implementation:* Store rationale on the version; render it on the timeline (T4.2) and a version-history list.
- *Acceptance:* Rationale persists and appears against the correct version.
- *Tests:* integration (rationale stored on right version); display test.
- *Depends on:* T4.5, T4.2
- *Human:* —

### Phase 5 — Resolution

**T5.1 — Resolve flow (binary)**
- *Goal:* Record what actually happened.
- *Implementation:* "Resolve" action sets `resolvedOutcome` (true/false), `resolvedAt`, optional `resolutionNotes`, `status:'resolved'`; lock further edits/check-ins.
- *Acceptance:* Resolving sets fields and prevents new versions; double-resolution prevented.
- *Tests:* integration (resolve sets state, locks edits, blocks re-resolve); user-isolation.
- *Depends on:* T3.7
- *Human:* Resolving a forecast is a real, hard-to-reverse data action — worth confirming before locking edits on real data.

**T5.2 — Resolved-state UI**
- *Goal:* Show outcome against the forecast.
- *Implementation:* On a resolved forecast, display the outcome, the final pre-resolution headline, and the trajectory with an outcome marker (0 or 1).
- *Acceptance:* Resolved view clearly shows outcome vs trajectory; no edit affordances.
- *Tests:* component test with a resolved fixture.
- *Depends on:* T5.1, T4.2
- *Human:* —

**T5.3 — Auto-resolution scaffold (deferred logic)**
- *Goal:* Leave a clean hook for public-event auto-resolution later.
- *Implementation:* Add a `publiclyResolvable` boolean on creation and a stubbed `/api/llm/resolve` route (auth-gated, returns "not implemented"); **no real logic**.
- *Acceptance:* Flag persists; stub route is auth-gated and returns a clear not-implemented response.
- *Tests:* route auth test; flag persistence.
- *Depends on:* T5.1, (T7.1 if built first)
- *Human:* —

### Phase 6 — Calibration loop

**T6.1 — Scoring functions**
- *Goal:* Proper scores.
- *Implementation:* `brier(p,o) = (p−o)²`; `logScore(p,o) = −(o·ln p + (1−o)·ln(1−p))` with `p` clamped to `[ε, 1−ε]`.
- *Acceptance:* Known values exact: `brier(0.7,1)=0.09`, `brier(0.5,0)=0.25`, `logScore(0.7,1)=0.3567…`.
- *Tests:* known-value unit tests; clamping prevents `±∞`.
- *Depends on:* T0.1
- *Human:* —

**T6.2 — Per-forecast score computation**
- *Goal:* Score each resolved forecast.
- *Implementation:* Take the **final pre-resolution headline** as the scored `p` against `o ∈ {0,1}`; (optional) also compute scores at each version for a trajectory.
- *Acceptance:* Each resolved forecast yields a Brier + log score; open forecasts excluded.
- *Tests:* integration over seeded resolved forecasts; excludes open ones.
- *Depends on:* T6.1, T5.1
- *Human:* —

**T6.3 — Calibration dashboard**
- *Goal:* Show the user how well-calibrated they are.
- *Implementation:* Reliability diagram — bin resolved forecasts by predicted probability (deciles), plot mean predicted vs observed frequency, with counts per bin; show aggregate mean Brier + mean log score and total resolved; **"need more resolved forecasts to be meaningful"** messaging under a threshold.
- *Acceptance:* Diagram + aggregates render from real resolved data; sparse-data state is honest, not misleading.
- *Tests:* binning unit tests (assignment, mean-per-bin); component test with a fixture set; sparse-data messaging test.
- *Depends on:* T6.2
- *Human:* Colorblind-safe check on the reliability diagram, and whether sparse-data messaging reads as honest rather than discouraging, are worth your eyes.

**T6.4 — Subevent-level scoring (optional/advanced)**
- *Goal:* Richer feedback where sub-events are themselves resolvable.
- *Implementation:* Allow marking individual leaf nodes resolvable + recording their outcomes; score those nodes' committed probabilities; surface patterns (e.g. consistent optimism on a tagged node category). **Build only if Phase 6 core is solid.**
- *Acceptance:* Resolvable leaves can be scored independently; per-node scores computed correctly.
- *Tests:* scoring tests on tagged-leaf fixtures.
- *Depends on:* T6.2
- *Human:* —

### Phase 7 — Co-pilot scaffold (LLM path; features deferred)

**T7.1 — Secure Claude proxy route**
- *Goal:* A safe server-only LLM seam.
- *Implementation:* `/api/llm/*` route handler that reads `ANTHROPIC_API_KEY` **server-side only**, requires an authenticated user, scopes any request to that user's data, and rate-limits; never returns the key; never mixes users.
- *Acceptance:* Key absent from client bundle; unauthed requests rejected; a mocked happy-path returns a model response shape.
- *Tests:* bundle-inspection/test asserting the key string never appears client-side; auth-required test; user-scoping test; (mocked) happy-path.
- *Depends on:* T1.1
- *Human:* Only you hold the ANTHROPIC_API_KEY — it has to be supplied via your env/Vercel secrets, I can't generate or obtain it.

**T7.2 — "Suggest decomposition" stub (feature-flagged)**
- *Goal:* Define the future contract without shipping the product feature.
- *Implementation:* Endpoint + typed request/response for "given a question, suggest sub-events"; behind a default-off feature flag; minimal/placeholder model prompt; clearly marked experimental.
- *Acceptance:* Flag off by default; when on, returns a well-typed (possibly trivial) suggestion; off → endpoint inert.
- *Tests:* flag on/off behaviour; response schema validation (mocked LLM).
- *Depends on:* T7.1
- *Human:* —

### Phase 8 — Polish, mobile-readiness, hardening

**T8.1 — Responsive + PWA**
- *Goal:* Usable and installable on mobile browsers (cheapest mobile path; native wrappers later).
- *Implementation:* Responsive layouts for all screens; PWA manifest + icons + service worker (offline shell).
- *Acceptance:* Core screens usable at mobile widths; app is installable; Lighthouse PWA checks pass.
- *Tests:* a couple of viewport-sized Playwright runs; manifest presence test.
- *Depends on:* Phases 3–6 screens.
- *Human:* Actually installing the PWA on your phone and confirming it feels right is a physical-device check I can't do.

**T8.2 — States: loading / empty / error**
- *Goal:* No raw spinners or crashes.
- *Implementation:* Consistent loading skeletons, empty states (no forecasts, no resolved data), and error boundaries with retry.
- *Acceptance:* Each major screen has all three states.
- *Tests:* component tests forcing each state.
- *Depends on:* Phases 3–6.
- *Human:* —

**T8.3 — Accessibility pass**
- *Goal:* Keyboard + screen-reader sane.
- *Implementation:* Labels, focus order, roles, contrast; audit with axe.
- *Acceptance:* No critical axe violations on core screens; tree editor operable by keyboard.
- *Tests:* automated axe checks in component/E2E tests.
- *Depends on:* Phases 3–6.
- *Human:* Automated axe checks miss real keyboard-only and screen-reader flow — and given your colorblindness, contrast matters more than usual here.

**T8.4 — Golden-path E2E**
- *Goal:* Prove the whole loop.
- *Implementation:* Playwright: sign in → create forecast → build a small tree → see headline → save → check-in with a large move (rationale required) → resolve → calibration updates.
- *Acceptance:* The full journey passes headlessly in CI.
- *Tests:* the E2E itself.
- *Depends on:* Phases 1–6.
- *Human:* —

**T8.5 — Deployment runbook & docs**
- *Goal:* Reproducible setup.
- *Implementation:* `README` with env vars, DB setup, migration + seed commands, deploy steps; `PROGRESS.md` checklist final state.
- *Acceptance:* A new dev can go from clone → running locally → deployed using only the docs.
- *Tests:* doc-driven dry run (manual checklist).
- *Depends on:* all.
- *Human:* The actual production deploy and confirming the docs work end-to-end is something only you can execute and sign off on.

---

## 9. Testing strategy (summary)

- **Engine (`/lib/engine`)** is tested hardest: seeded statistical assertions on samplers, round-trip elicitation fits, combinator truth tables, validation rules, and the §6.4 analytic anchors on the full runner. This is where correctness lives, and it's pure, so it's cheap to test exhaustively.
- **Data layer:** every repository function tested for correctness **and user isolation** (no cross-user reads) against an ephemeral DB.
- **API/server actions:** auth required, validation enforced server-side, version append correctness.
- **Components (RTL):** editor interactions, discipline guardrails, distribution previews, dashboards — including loading/empty/error states.
- **E2E (Playwright):** the golden path (T8.4) plus auth gating.
- **CI gate:** `lint` + `typecheck` + unit/integration suite on every PR; E2E at least nightly.

Each ticket above names the *specific* tests that constitute its proof; "done" means those are written and green.

---

## 10. Definition of v1 "done"

- A signed-in user can create a binary forecast, decompose it into a validated typed tree, model leaves via human-friendly elicitation with live distribution previews, and see a Monte-Carlo headline with a confidence interval.
- Forecasts are living: an append-only version history drives a belief-over-time chart; a user-defined cadence surfaces "due for review"; check-ins enforce update discipline (large moves require a rationale; prior shown beside proposed).
- Forecasts can be manually resolved; resolved views show outcome vs trajectory.
- A calibration dashboard shows a reliability diagram and Brier/log scores across resolved forecasts, honest about sparse data.
- The secure Claude proxy exists and is auth-gated, with a feature-flagged decomposition stub — co-pilot features can be slotted in without re-architecting.
- Responsive/PWA, accessible, with the golden-path E2E green in CI.

---

## 11. Backlog (v2+)

- **Categorical / >2-outcome questions** via a `case/switch` root: ordered branch conditions resolve to outcome labels; Monte-Carlo frequency over branches *is* the categorical distribution; multiclass Brier/log score drops in. (Schema already future-proofed via `questionType` and nullable outcome fields.)
- **Correlation / dependence** between sub-events — injected purely at the sampling seam (shared latent factors / copulas); node schemas unchanged. Plus an "independence looks violated" diagnostic when supposedly-independent sub-events keep co-resolving.
- **Sensitivity ranking** — perturb each leaf, rank impact on the headline; drive check-ins to "the nodes doing the work."
- **Automated / LLM resolution** for publicly-checkable events (the T5.3 hook).
- **Full co-pilot features** — decomposition suggestions, reference-class/base-rate research, distribution-from-prose fitting, red-teaming — always *suggesting*, never committing for the user.
- **Crowd / aggregation** (only if the personal-tool thesis ever changes).
- **Notifications** (email/push) for due check-ins.
- **Native wrappers** — Capacitor (mobile) / Electron (desktop) reusing the same React codebase.

---

*End of build plan.*
