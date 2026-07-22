import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulate, normalize, restrictAndRenormalize, crossEntropy, entropyOfSpans } from '../scripts/lib/prior-crossval.mjs';

const CELLS = ['A', 'B', 'C', 'D'];

test('normalize renormalizes to sum to 1 even after epsilon-flooring zero-mass cells', () => {
  const mass = { A: 3, B: 1, C: 0, D: 0 };
  const dist = normalize(mass, CELLS);
  const sum = CELLS.reduce((s, c) => s + dist[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(dist.C > 0 && dist.D > 0); // floored, not zero
});

test('a span whose full probability sums to 1 across ALL cells becomes sub-stochastic when scored on a subset directly — restrictAndRenormalize fixes that', () => {
  // span carries mass mostly OUTSIDE the subset {A, B} — the bug this
  // regression test targets: scoring {A, B} against this span's raw values
  // uses only 0.3 of probability mass, not 1.
  const span = { A: 0.1, B: 0.2, C: 0.5, D: 0.2 };
  const rawSubsetSum = ['A', 'B'].reduce((s, c) => s + span[c], 0);
  assert.ok(rawSubsetSum < 1); // confirms the sub-stochastic condition this bug depends on

  const [renormalized] = restrictAndRenormalize([span], ['A', 'B']);
  const renormSum = ['A', 'B'].reduce((s, c) => s + renormalized[c], 0);
  assert.ok(Math.abs(renormSum - 1) < 1e-9);
  assert.ok(Math.abs(renormalized.A - 0.1 / 0.3) < 1e-9);
  assert.ok(Math.abs(renormalized.B - 0.2 / 0.3) < 1e-9);
});

test('REGRESSION: KL divergence is never negative when comparing a restricted cell subset (Gibbs\' inequality)', () => {
  // Reproduces the exact bug found in the corpus cross-validation run: spans
  // where EVA/REC-equivalent cells absorb most of the probability mass, and
  // the interesting comparison excludes them. Scoring un-renormalized
  // subset probabilities against a fully-renormalized Q produced negative KL.
  const spans = [
    { A: 0.05, B: 0.05, C: 0.7, D: 0.2 },
    { A: 0.1, B: 0.02, C: 0.68, D: 0.2 },
    { A: 0.03, B: 0.08, C: 0.71, D: 0.18 },
  ];
  const subset = ['A', 'B'];
  const renormSpans = restrictAndRenormalize(spans, subset);
  const Q = normalize(accumulate(renormSpans, subset), subset);
  const h = entropyOfSpans(renormSpans, subset);
  const ce = crossEntropy(renormSpans, Q, subset);
  assert.ok(ce - h >= -1e-9, `KL should be >= 0, got ${ce - h}`);
});

test('crossEntropy of a distribution against ITSELF equals its own entropy (KL == 0)', () => {
  const spans = [{ A: 0.4, B: 0.3, C: 0.2, D: 0.1 }, { A: 0.1, B: 0.1, C: 0.4, D: 0.4 }];
  const Q = normalize(accumulate(spans, CELLS), CELLS);
  const h = entropyOfSpans(spans, CELLS);
  const ce = crossEntropy(spans, Q, CELLS);
  assert.ok(Math.abs(ce - h) < 1e-9);
});

test('a uniform Q always costs exactly log2(cell count) bits, regardless of the data', () => {
  const spans = [{ A: 1, B: 0, C: 0, D: 0 }, { A: 0, B: 0, C: 0, D: 1 }];
  const Puniform = Object.fromEntries(CELLS.map((c) => [c, 1 / CELLS.length]));
  const ce = crossEntropy(spans, Puniform, CELLS);
  assert.ok(Math.abs(ce - Math.log2(CELLS.length)) < 1e-9);
});
