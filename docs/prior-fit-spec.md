# Prior fit — finding the best prior for a source

`src/prior-fit.js` makes "which prior best fits this source?" a first-class,
importable operation, using the compression technique this repo already runs
(SPEC.md §4.4a, §6) rather than a bespoke score.

## The idea in one line

The best prior for a source is the one under which the source's own folds cost
the fewest bits to describe — the prior that **minimizes surprise**. That is
cross-entropy in bits per span, the same estimator
`scripts/lib/prior-crossval.mjs` cross-validates with; `prior-fit.js` lifts it
out of the experiment harness.

## Inputs

- **A source** — either a single aggregate 27-cell distribution (one vector for
  the whole source) or an array of per-span fold distributions (from
  `readingToFold` + `measureFold`). Both are supported; the metric is the mean
  over spans, so an aggregate is just the one-span case.
- **A prior** — any 27-cell distribution: a `Pocket@1`'s `distributions`, a
  `corpus-prior.json`'s `distribution_ppm`, or a plain `{cell: prob}` map.

## Outputs (`scorePriorFit`)

| field | meaning |
|---|---|
| `crossEntropyBits` | `H(P, Q) = Σ P(c)·−log₂ Q(c)` — the raw bill in bits/span. |
| `sourceEntropyBits` | `H(P)` — the source's own irreducible cost, the floor. |
| `klBits` | `H(P,Q) − H(P)` — the *avoidable* cost of an imperfect prior, ≥ 0 by Gibbs. |
| `surpriseReductionBits` | `H(P, uniform) − H(P, Q)` — **bits saved per span** vs. a cold uniform prior. The ranking key; higher is better. |

## Two conventions that keep the numbers honest

1. **Content-only by default.** `EVA_Binding_Lens` and `REC_Making_Lens` are the
   reader's always-on evaluate/predict acts; they fire on ~every span and carry
   the bulk of any corpus prior's mass, so they say almost nothing about fit.
   `contentOnly: true` (the default) silences them, exactly as every genre /
   crossval experiment in `scripts/` does. `EXCLUDED_UNIVERSAL_CELLS` in
   `src/fold-cells.js`.
2. **Shared cell space.** A source distribution is renormalized *within* the
   scored cell set before comparison, so a restricted content-cell view stays a
   proper probability vector and KL never reads negative (the invariant
   `restrictAndRenormalize` protects).

## Reading under a prior (`blendWithPrior`)

`blendWithPrior(localDistribution, prior, { cellKeys, alpha })` is the predictor
`scripts/reading-improvement-experiment.mjs` uses: local (within-document)
counts + `α`·prior pseudo-counts (Dirichlet / empirical-Bayes shrinkage). A
prior lowers reading surprise most in the **cold-start zone**, before a document
has built its own history — which is why an active prior seeded into the Ground
channels (`priorMass → Void`, `priorBond → Field`, `priorProp → Atmosphere`)
reduces the reader's opening surprisal.

## Ranking (`rankPriors`)

`rankPriors(source, priors, opts)` scores every candidate and returns them best
(least surprising) first, each fit record carrying a `rank`. That is the list an
"inspectable priors" surface renders as "best priors for this source."
