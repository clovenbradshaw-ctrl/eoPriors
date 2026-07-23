import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulate, normalize, restrictAndRenormalize, crossEntropy, entropyOfSpans, projectToGroups, siteGroupsOf, zeroExcludedAndRenormalize } from '../scripts/lib/prior-crossval.mjs';

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

test('projectToGroups sums member cells into a coarser space without needing renormalization', () => {
  // {A,B} -> group1, {C,D} -> group2. A span already summing to 1 over A..D
  // should still sum to 1 after projection — collapsing a partition never
  // drops probability mass, unlike restricting to a genuine subset.
  const spans = [{ A: 0.1, B: 0.2, C: 0.3, D: 0.4 }];
  const grouping = { group1: ['A', 'B'], group2: ['C', 'D'] };
  const [projected] = projectToGroups(spans, grouping);
  assert.ok(Math.abs(projected.group1 - 0.3) < 1e-9);
  assert.ok(Math.abs(projected.group2 - 0.7) < 1e-9);
  const sum = Object.values(projected).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('projecting all the way down to a single group collapses cross-entropy to exactly 0 bits — the bottom of the line carries no information by construction', () => {
  const spans = [{ A: 0.1, B: 0.2, C: 0.3, D: 0.4 }, { A: 0.9, B: 0.05, C: 0.03, D: 0.02 }];
  const grouping = { ALL: ['A', 'B', 'C', 'D'] };
  const projected = projectToGroups(spans, grouping);
  const Q = normalize(accumulate(projected, ['ALL']), ['ALL']);
  const ce = crossEntropy(projected, Q, ['ALL']);
  assert.ok(Math.abs(ce) < 1e-9, 'a single-bucket space has only one possible cell, so surprise is always 0');
});

test('siteGroupsOf partitions cells by their cube site, restricted to the given cellKeys', () => {
  const cellsBundle = {
    cells: {
      NUL_Dissecting_Entity: { op: 'NUL', grain: 'Figure', site: 'Entity' },
      SIG_Binding_Entity: { op: 'SIG', grain: 'Figure', site: 'Entity' },
      INS_Making_Entity: { op: 'INS', grain: 'Figure', site: 'Entity' },
      SEG_Dissecting_Link: { op: 'SEG', grain: 'Figure', site: 'Link' },
      CON_Binding_Link: { op: 'CON', grain: 'Figure', site: 'Link' },
      DEF_Dissecting_Lens: { op: 'DEF', grain: 'Figure', site: 'Lens' },
      EVA_Binding_Lens: { op: 'EVA', grain: 'Figure', site: 'Lens' },
    },
  };
  const contentKeys = ['NUL_Dissecting_Entity', 'SIG_Binding_Entity', 'INS_Making_Entity', 'SEG_Dissecting_Link', 'CON_Binding_Link', 'DEF_Dissecting_Lens'];
  const groups = siteGroupsOf(cellsBundle, contentKeys);
  assert.deepEqual(Object.keys(groups).sort(), ['Entity', 'Lens', 'Link']);
  assert.equal(groups.Entity.length, 3);
  assert.equal(groups.Link.length, 2);
  assert.equal(groups.Lens.length, 1); // EVA_Binding_Lens excluded — wasn't in contentKeys
});

test('zeroExcludedAndRenormalize zeroes the excluded cells and rescales the rest back to sum to 1e6', () => {
  const measurements = {
    EVA_Binding_Lens: { amplitude_ppm: 400_000, similarity_ppm: 400_000 },
    REC_Making_Lens: { amplitude_ppm: 300_000, similarity_ppm: 300_000 },
    CON_Binding_Link: { amplitude_ppm: 200_000, similarity_ppm: 200_000 },
    INS_Making_Entity: { amplitude_ppm: 100_000, similarity_ppm: 100_000 },
  };
  const out = zeroExcludedAndRenormalize(measurements, ['EVA_Binding_Lens', 'REC_Making_Lens']);
  assert.equal(out.EVA_Binding_Lens.amplitude_ppm, 0);
  assert.equal(out.REC_Making_Lens.amplitude_ppm, 0);
  // original 200k/300k split among the kept 300k total -> 2/3 and 1/3 of 1e6
  assert.equal(out.CON_Binding_Link.amplitude_ppm, 666_667);
  assert.equal(out.INS_Making_Entity.amplitude_ppm, 333_333);
  const sum = Object.values(out).reduce((s, m) => s + m.amplitude_ppm, 0);
  assert.equal(sum, 1_000_000);
});

test('zeroExcludedAndRenormalize on a measurement with ALL mass in excluded cells produces all-zero, not NaN/division-by-zero', () => {
  const measurements = {
    EVA_Binding_Lens: { amplitude_ppm: 600_000, similarity_ppm: 600_000 },
    REC_Making_Lens: { amplitude_ppm: 400_000, similarity_ppm: 400_000 },
    CON_Binding_Link: { amplitude_ppm: 0, similarity_ppm: 0 },
  };
  const out = zeroExcludedAndRenormalize(measurements, ['EVA_Binding_Lens', 'REC_Making_Lens']);
  assert.equal(out.CON_Binding_Link.amplitude_ppm, 0);
  assert.ok(!Number.isNaN(out.CON_Binding_Link.amplitude_ppm));
});
