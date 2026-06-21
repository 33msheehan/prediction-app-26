# `/lib/engine` — Monte Carlo engine (pure)

**Seam rule (do not violate):** this directory is a pure TypeScript library.
**No React, no DB, no network imports — ever.** It takes a `Tree` + config and
returns a result, which makes it exhaustively unit-testable and reusable.

Correlation between sub-events is added later **only** by swapping the sampler,
never by changing node schemas.

Planned modules (Phase 2):

- `rng.ts` — seedable PRNG + independent streams (T2.1)
- `distributions.ts` — the nine samplers (T2.2)
- `fitters.ts` — elicitation → params (T2.3)
- `tree.ts` — types, output-type helper, traversal (T2.4)
- `combinators.ts` — and/or/not/k_of_n/count_true/sum/threshold (T2.5)
- `validate.ts` — `validateTree()` (T2.6)
- `runner.ts` — `runForecast()` (T2.7)
