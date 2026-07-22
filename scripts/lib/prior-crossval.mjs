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

export function crossEntropy(spans, Q, cellKeys) {
  let total = 0;
  for (const probs of spans) {
    let bits = 0;
    for (const c of cellKeys) {
      const p = probs[c] || 0;
      if (p > 0) bits += -p * Math.log2(Q[c]);
    }
    total += bits;
  }
  return spans.length ? total / spans.length : 0;
}

// Entropy of the AGGREGATE distribution across a set of spans — that
// distribution's own best-case (lowest achievable) cross-entropy against itself.
export function entropyOfSpans(spans, cellKeys) {
  const dist = normalize(accumulate(spans, cellKeys), cellKeys);
  let h = 0;
  for (const c of cellKeys) if (dist[c] > 0) h += -dist[c] * Math.log2(dist[c]);
  return h;
}
