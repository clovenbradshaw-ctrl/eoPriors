// scripts/lib/prior-crossval.mjs — the pure math for cross-validating a
// 27-cell prior: does an aggregate distribution built from one set of real
// folds predict a DISJOINT held-out set's actual cell distribution better
// than naive baselines? Used by scripts/crossval-fold-priors.mjs.
//
// Metric: cross-entropy in bits, averaged per span — the standard sample
// cross-entropy estimator, Sum_span Sum_cell span_prob(cell) * -log2(Q(cell)),
// using each span's own (possibly multi-cell) fold probability rather than a
// crude single-label guess. KL(heldout || Q) = crossEntropy(heldout, Q) -
// entropy(heldout) isolates the AVOIDABLE cost of an imperfect prior from the
// held-out set's own irreducible entropy — and must never be negative
// (Gibbs' inequality). It will read negative if the two sides of the
// comparison are normalized over different cell sets — see
// restrictAndRenormalize's doc comment, which exists specifically to prevent
// that (caught for real: scoring a cell-subset like "excluding EVA/REC"
// directly against a span's full-27-cell-normalized probabilities produces a
// sub-stochastic vector that silently breaks the invariant).

const EPS = 1e-6; // Laplace-style smoothing floor so log2(0) never happens

export function accumulate(spans, cellKeys) {
  const mass = Object.fromEntries(cellKeys.map((c) => [c, 0]));
  for (const probs of spans) for (const c of cellKeys) mass[c] += probs[c] || 0;
  return mass;
}

// Normalize an accumulated raw-mass distribution to probabilities, with an
// epsilon floor so a cell the train set never saw doesn't force -Infinity
// bits when the held-out set touches it.
export function normalize(mass, cellKeys) {
  const total = cellKeys.reduce((s, c) => s + (mass[c] || 0), 0);
  const dist = {};
  for (const c of cellKeys) dist[c] = total > 0 ? Math.max(EPS, (mass[c] || 0) / total) : 1 / cellKeys.length;
  const norm = cellKeys.reduce((s, c) => s + dist[c], 0);
  for (const c of cellKeys) dist[c] /= norm; // renormalize after flooring
  return dist;
}

// A span's raw probs sum to 1 across its FULL cell space. Scoring a
// restricted subset directly against those raw values compares a
// sub-stochastic vector (sums to <1 within the subset) against a
// fully-renormalized Q — that mismatch breaks KL>=0. Renormalize each span's
// probs to sum to 1 WITHIN the given cellKeys first, so entropy and
// cross-entropy for a restricted view are computed in the same probability
// space as each other and as Q.
export function restrictAndRenormalize(spans, cellKeys) {
  return spans.map((probs) => {
    const total = cellKeys.reduce((s, c) => s + (probs[c] || 0), 0);
    const out = {};
    for (const c of cellKeys) out[c] = total > 0 ? (probs[c] || 0) / total : 1 / cellKeys.length;
    return out;
  });
}

// Each span's OWN cross-entropy contribution under Q, in bits — the
// per-observation surprise, not yet averaged. crossEntropy() is this array's
// mean; keeping the array itself lets a caller look at spread (std-dev) and
// correlate it against another per-span signal (e.g. a reader's own
// intra-document surprisal), which the mean alone can't answer.
export function perSpanSurprise(spans, Q, cellKeys) {
  return spans.map((probs) => {
    let bits = 0;
    for (const c of cellKeys) {
      const p = probs[c] || 0;
      if (p > 0) bits += -p * Math.log2(Q[c]);
    }
    return bits;
  });
}

export function crossEntropy(spans, Q, cellKeys) {
  const per = perSpanSurprise(spans, Q, cellKeys);
  return per.length ? per.reduce((s, x) => s + x, 0) / per.length : 0;
}

// Entropy of the AGGREGATE distribution across a set of spans — that
// distribution's own best-case (lowest achievable) cross-entropy against itself.
export function entropyOfSpans(spans, cellKeys) {
  const dist = normalize(accumulate(spans, cellKeys), cellKeys);
  let h = 0;
  for (const c of cellKeys) if (dist[c] > 0) h += -dist[c] * Math.log2(dist[c]);
  return h;
}

// Collapse a set of already-renormalized spans into a COARSER cell space —
// "how far down the divided line": a grouping like { Entity: [...3 cells],
// Link: [...3 cells], Lens: [...1 cell] } sums each span's member-cell
// probabilities into one group probability, producing a genuinely blurrier
// projection (not a re-labeling) of the same underlying evidence. A span's
// probabilities already sum to 1 over the input cellKeys, and group
// membership partitions those same cellKeys, so the output already sums to 1
// — no renormalization needed here (unlike restrictAndRenormalize, which
// handles a genuine SUBSET that drops probability mass).
export function projectToGroups(spans, grouping) {
  const groupKeys = Object.keys(grouping);
  return spans.map((probs) => {
    const out = {};
    for (const g of groupKeys) out[g] = grouping[g].reduce((s, c) => s + (probs[c] || 0), 0);
    return out;
  });
}

// Partitions cellsBundle's cells by `site`, restricted to the given cellKeys
// (e.g. content-only, excluding the near-universal operators) — the site
// groupings a "shadow" collapses each domain's three operators into (site is
// shared by the operators of one domain at one grain: Entity is NUL/SIG/INS
// at Figure, per data/phasepost-cells.json).
export function siteGroupsOf(cellsBundle, cellKeys) {
  const groups = {};
  for (const key of cellKeys) {
    const site = cellsBundle.cells[key].site;
    (groups[site] ||= []).push(key);
  }
  return groups;
}
