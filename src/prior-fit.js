// src/prior-fit.js — "the best prior for a given source," made a first-class,
// importable operation instead of an experiment script.
//
// The compression technique this repo already runs (SPEC.md §4.4a, §6) reads a
// source into per-span 27-cell fold distributions and measures how many bits it
// costs to describe them. A PRIOR is an aggregate 27-cell distribution Q. The
// best prior for a source is the one under which the source's own folds cost the
// fewest bits — i.e. the prior that MINIMIZES SURPRISE. That is exactly
// cross-entropy in bits per span, the same estimator scripts/lib/prior-crossval.mjs
// cross-validates with; this module lifts that math out of the experiment
// harness so the app (and any reader) can rank priors for a source without
// pulling in a whole corpus run.
//
// Two surprise numbers matter and they are reported separately:
//   crossEntropyBits   — H(P, Q) = Σ_cell P(cell)·−log₂ Q(cell), the raw bill.
//   surpriseReductionBits — H(P, uniform) − H(P, Q): bits SAVED per span by
//                           reading under Q instead of a cold uniform prior.
//                           This is the "minimize surprise" quantity, and it is
//                           the ranking key (higher = better prior).
//   klBits             — H(P, Q) − H(P): the AVOIDABLE cost of an imperfect
//                           prior, ≥ 0 by Gibbs (given a shared cell space).
//
// P may be a single aggregate distribution (one 27-cell vector for the whole
// source) or an array of per-span distributions; both are supported so a caller
// with only a coarse source profile and a caller with a full per-span read get
// the same metric. The math is the array's mean, so a single distribution is
// just the one-element case.

import { EXCLUDED_UNIVERSAL_CELLS } from './fold-cells.js';

const EPS = 1e-6; // Laplace-style smoothing floor so log2(0) never happens.

// ── distribution normalization ───────────────────────────────────────────────

// Accept a prior as either a plain {cell: prob} map, a {cell: ppm} map
// (corpus-prior.json's distribution_ppm), or the whole corpus-prior artifact.
// Returns a probabilities map over `cellKeys`, ε-floored and renormalized so a
// cell the prior never saw can still be scored against (Gibbs stays honest).
export function priorToDistribution(prior, cellKeys) {
  const raw = prior?.distribution_ppm || prior?.distribution || prior?.distributions || prior || {};
  const mass = {};
  let total = 0;
  for (const c of cellKeys) {
    const v = Number(raw[c]) || 0;
    mass[c] = v < 0 ? 0 : v;
    total += mass[c];
  }
  const dist = {};
  for (const c of cellKeys) dist[c] = total > 0 ? Math.max(EPS, mass[c] / total) : 1 / cellKeys.length;
  const norm = cellKeys.reduce((s, c) => s + dist[c], 0);
  for (const c of cellKeys) dist[c] /= norm;
  return dist;
}

// A span/source distribution is normalized WITHIN cellKeys (so a restricted
// content-cell view stays a proper probability vector — the invariant
// restrictAndRenormalize protects in prior-crossval.mjs).
function restrictSpan(probs, cellKeys) {
  const total = cellKeys.reduce((s, c) => s + (Number(probs[c]) || 0), 0);
  const out = {};
  for (const c of cellKeys) out[c] = total > 0 ? (Number(probs[c]) || 0) / total : 1 / cellKeys.length;
  return out;
}

function asSpans(source) {
  if (Array.isArray(source)) return source;
  if (source && typeof source === 'object') {
    if (Array.isArray(source.spans)) return source.spans;
    const raw = source.distribution_ppm || source.distribution || source;
    return [raw];
  }
  return [];
}

// ── the metrics ──────────────────────────────────────────────────────────────

export function perSpanSurprise(spans, Q, cellKeys) {
  return spans.map((raw) => {
    const probs = restrictSpan(raw, cellKeys);
    let bits = 0;
    for (const c of cellKeys) {
      const p = probs[c];
      if (p > 0) bits += -p * Math.log2(Q[c]);
    }
    return bits;
  });
}

export function crossEntropyBits(spans, Q, cellKeys) {
  const per = perSpanSurprise(spans, Q, cellKeys);
  return per.length ? per.reduce((s, x) => s + x, 0) / per.length : 0;
}

// Entropy of the aggregate source distribution — its own irreducible cost, the
// floor no prior can beat. crossEntropy − this = KL.
export function sourceEntropyBits(spans, cellKeys) {
  const agg = Object.fromEntries(cellKeys.map((c) => [c, 0]));
  for (const raw of spans) {
    const probs = restrictSpan(raw, cellKeys);
    for (const c of cellKeys) agg[c] += probs[c];
  }
  const total = cellKeys.reduce((s, c) => s + agg[c], 0);
  let h = 0;
  for (const c of cellKeys) {
    const p = total > 0 ? agg[c] / total : 0;
    if (p > 0) h += -p * Math.log2(p);
  }
  return h;
}

// ── the operation the app calls ──────────────────────────────────────────────

// Score one prior against one source. `contentOnly` (default true) silences the
// near-universal EVA/REC cells that fire on ~every span and would otherwise
// swamp the discriminating signal — the same restriction every genre/crossval
// experiment in this repo applies before trusting a fit number.
export function scorePriorFit(source, prior, { cellKeys, contentOnly = true } = {}) {
  if (!Array.isArray(cellKeys) || cellKeys.length === 0) {
    throw new TypeError('scorePriorFit: cellKeys (the 27-cell key list) is required');
  }
  const keys = contentOnly ? cellKeys.filter((c) => !EXCLUDED_UNIVERSAL_CELLS.includes(c)) : cellKeys;
  const spans = asSpans(source);
  const Q = priorToDistribution(prior, keys);
  const crossEntropy = crossEntropyBits(spans, Q, keys);
  const entropy = sourceEntropyBits(spans, keys);
  const uniformBits = Math.log2(keys.length); // H(P, uniform) for any P over |keys| cells
  return Object.freeze({
    prior_id: prior?.pocket_id || prior?.snapshot_id || prior?.id || prior?.corpus_prior_version || null,
    cell_space: contentOnly ? 'content' : 'full',
    cells_scored: keys.length,
    spans_scored: spans.length,
    crossEntropyBits: crossEntropy,
    sourceEntropyBits: entropy,
    klBits: Math.max(0, crossEntropy - entropy),
    uniformBits,
    // The headline "minimize surprise" number: bits saved per span vs. reading
    // this source with no prior at all. Positive means the prior helps.
    surpriseReductionBits: uniformBits - crossEntropy,
  });
}

// Rank a set of priors for one source, best (least surprising) first. Returns
// each prior's fit record with a `rank` field, so the caller can render "best
// priors for this source" directly.
export function rankPriors(source, priors, opts = {}) {
  const scored = priors
    .map((prior) => ({ prior, fit: scorePriorFit(source, prior, opts) }))
    .sort((a, b) => b.fit.surpriseReductionBits - a.fit.surpriseReductionBits);
  return scored.map((entry, i) => ({ ...entry, fit: { ...entry.fit, rank: i + 1 } }));
}

// Blend a source's own local (within-document) distribution with a corpus prior
// by Dirichlet/empirical-Bayes shrinkage: local counts + α·prior pseudo-counts.
// This is the predictor scripts/reading-improvement-experiment.mjs uses to show
// a prior lowers reading surprise MOST in the cold-start zone, before a document
// has built its own history. α is the prior's pseudo-count strength.
export function blendWithPrior(localDistribution, prior, { cellKeys, alpha = 1 } = {}) {
  if (!Array.isArray(cellKeys) || cellKeys.length === 0) {
    throw new TypeError('blendWithPrior: cellKeys is required');
  }
  const local = restrictSpan(localDistribution || {}, cellKeys);
  const Q = priorToDistribution(prior, cellKeys);
  const blended = {};
  let total = 0;
  for (const c of cellKeys) {
    blended[c] = local[c] + alpha * Q[c];
    total += blended[c];
  }
  for (const c of cellKeys) blended[c] = total > 0 ? blended[c] / total : 1 / cellKeys.length;
  return blended;
}
