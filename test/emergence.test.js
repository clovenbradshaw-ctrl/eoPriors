import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bhattacharyyaCoefficient, meanPrototype, compressionGainBits,
  condenseFigures, promoteFigurePatterns, condenseGround, assignHolonIdentity, emergeHolons,
} from '../src/emergence.js';

// 12 toy cells, not 27 — small enough to reason about by hand, but enough
// that two distributions peaked on genuinely different cells don't share
// substantial "rest" mass just from having too few cells to spread it over
// (four cells was not enough: a 0.9-peaked distribution's remaining 0.1
// spread over only 3 other cells overlaps a different-peaked one far more
// than the real 27-cell space ever would).
const CELLS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
const dist = (peakCell, peakMass, cells = CELLS) => {
  const rest = (1 - peakMass) / (cells.length - 1);
  return Object.fromEntries(cells.map((c) => [c, c === peakCell ? peakMass : rest]));
};
// emergence.js consumes phasepost_measurements shaped like compress.js's
// output ({ cell: { amplitude_ppm } }); these tests work directly in
// probability space and convert once here rather than round-tripping
// through compress.js's embedder-dependent pipeline.
const toMeasurements = (probabilities) =>
  Object.fromEntries(Object.entries(probabilities).map(([cell, p]) => [cell, { amplitude_ppm: Math.round(p * 1e6), similarity_ppm: Math.round(p * 1e6) }]));

test('bhattacharyyaCoefficient: identical distributions → 1, disjoint support → 0', () => {
  const p = dist('A', 0.9);
  assert.ok(Math.abs(bhattacharyyaCoefficient(p, p) - 1) < 1e-9);
  const q = { A: 0, B: 1, C: 0, D: 0 };
  const r = { A: 1, B: 0, C: 0, D: 0 };
  assert.equal(bhattacharyyaCoefficient(q, r), 0);
});

test('meanPrototype renormalizes the elementwise mean to sum to 1', () => {
  const proto = meanPrototype([dist('A', 1), dist('B', 1)]);
  const sum = Object.values(proto).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(proto.A - 0.5) < 1e-9);
  assert.ok(Math.abs(proto.B - 0.5) < 1e-9);
});

test('compressionGainBits: identical peaked vectors give strongly positive gain; lowering overhead only helps', () => {
  // A single observation's entropy over this 4-cell toy space tops out at
  // log2(4) = 2 bits (far less over the real 27-cell space, log2(27) ≈
  // 4.755) — overhead has to sit well under whatever ceiling applies, or
  // nothing ever clears it (this is the exact miscalibration src/emergence.js's
  // DEFAULT_MINT_OVERHEAD_BITS = 1 fixes relative to the real 27-cell space;
  // 0.3 here is the analogous small-relative-to-the-toy-ceiling choice).
  const identical = [dist('A', 0.95), dist('A', 0.95), dist('A', 0.95)];
  const highOverhead = compressionGainBits(identical, { mintOverheadBits: 0.3 }).gain_bits;
  const lowOverhead = compressionGainBits(identical, { mintOverheadBits: 0.01 }).gain_bits;
  assert.ok(highOverhead > 0, 'near-identical observations should clear even a real overhead');
  assert.ok(lowOverhead > highOverhead, 'lowering the mint overhead must only increase gain, never decrease it');
});

test('compressionGainBits: mutually dissimilar vectors give non-positive gain even at a near-zero overhead', () => {
  const dissimilar = [dist('A', 0.9), dist('B', 0.9), dist('C', 0.9)]; // each confidently peaked on a DIFFERENT cell — nothing shared
  const { gain_bits } = compressionGainBits(dissimilar, { mintOverheadBits: 0.01 });
  assert.ok(gain_bits <= 0, `expected non-positive gain for mutually dissimilar inputs, got ${gain_bits}`);
});

test('condenseFigures: a tight 3-member cluster condenses; a dissimilar singleton stays residual', () => {
  const observations = [
    { observation_id: 'o1', source_id: 's1', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o2', source_id: 's1', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o3', source_id: 's2', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o4', source_id: 's3', phasepost_measurements: toMeasurements(dist('C', 0.9)) },
  ];
  const { figures, residualObservations } = condenseFigures(observations, { mintOverheadBits: 0.3 });
  assert.equal(figures.length, 1);
  assert.equal(figures[0].supporting_observation_ids.length, 3);
  assert.deepEqual(new Set(figures[0].supporting_observation_ids), new Set(['o1', 'o2', 'o3']));
  assert.equal(residualObservations.length, 1);
  assert.equal(residualObservations[0].id, 'o4');
});

test('condenseGround finds condensation among residuals at its own (lower) bar', () => {
  const residuals = [
    { id: 'r1', sourceId: 'sA', probabilities: dist('A', 0.4) },
    { id: 'r2', sourceId: 'sB', probabilities: dist('A', 0.4) },
  ];
  const grounds = condenseGround(residuals, { mintOverheadBits: 0.01 });
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].grain, 'Ground');
  assert.deepEqual(new Set(grounds[0].supporting_observation_ids), new Set(['r1', 'r2']));
});

test('condenseGround requires at least 2 distinct sources', () => {
  const residuals = [
    { id: 'r1', sourceId: 'sA', probabilities: dist('A', 0.4) },
    { id: 'r2', sourceId: 'sA', probabilities: dist('A', 0.4) },
  ];
  assert.equal(condenseGround(residuals, { mintOverheadBits: 0.01 }).length, 0);
});

test('promoteFigurePatterns: two independently-sourced, near-identical figures merge into one Pattern that survives holdout', () => {
  const figures = [
    { grain: 'Figure', supporting_observation_ids: ['o1', 'o2'], source_ids: ['s1'], prototype: dist('A', 0.9), gain_bits: 1 },
    { grain: 'Figure', supporting_observation_ids: ['o3', 'o4'], source_ids: ['s2'], prototype: dist('A', 0.9), gain_bits: 1 },
    { grain: 'Figure', supporting_observation_ids: ['o5', 'o6'], source_ids: ['s3'], prototype: dist('A', 0.9), gain_bits: 1 },
  ];
  const { patterns, remainingFigures } = promoteFigurePatterns(figures, { mintOverheadBits: 0.3 });
  assert.equal(patterns.length, 1);
  assert.ok(patterns[0].source_ids.length >= 2);
  assert.equal(remainingFigures.length, 0);
});

test('promoteFigurePatterns: a single-source figure is never promoted alone', () => {
  const figures = [{ grain: 'Figure', supporting_observation_ids: ['o1', 'o2'], source_ids: ['s1'], prototype: dist('A', 0.9), gain_bits: 1 }];
  const { patterns, remainingFigures } = promoteFigurePatterns(figures, { mintOverheadBits: 0.3 });
  assert.equal(patterns.length, 0);
  assert.equal(remainingFigures.length, 1);
});

test('assignHolonIdentity: full overlap reuses the id; partial overlap is a rebound; zero overlap mints silently', async () => {
  const previous = [{ holon_id: 'holon:sha256:' + '1'.repeat(64), grain: 'Figure', supporting_observation_ids: ['o1', 'o2', 'o3'] }];

  const sameCandidate = { grain: 'Figure', supporting_observation_ids: ['o1', 'o2', 'o3'], prototype: dist('A', 0.9) };
  const same = await assignHolonIdentity(sameCandidate, previous, { threshold: 0.5 });
  assert.equal(same.holon_id, previous[0].holon_id);
  assert.equal(same.rebound, null);

  const partialCandidate = { grain: 'Figure', supporting_observation_ids: ['o1', 'o9', 'o10', 'o11'], prototype: dist('A', 0.9) }; // jaccard = 1/6 < 0.5, > 0
  const partial = await assignHolonIdentity(partialCandidate, previous, { threshold: 0.5 });
  assert.notEqual(partial.holon_id, previous[0].holon_id);
  assert.ok(partial.rebound, 'an ambiguous (nonzero but below-threshold) overlap must be recorded, not silently reassigned');

  const disjointCandidate = { grain: 'Figure', supporting_observation_ids: ['zzz'], prototype: dist('A', 0.9) };
  const disjoint = await assignHolonIdentity(disjointCandidate, previous, { threshold: 0.5 });
  assert.equal(disjoint.rebound, null, 'a genuinely new holon with zero overlap is not ambiguous');
});

test('emergeHolons end-to-end: figures, a promoted pattern, and identity continuity across two rebuilds', async () => {
  const observations = [
    { observation_id: 'o1', source_id: 's1', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o2', source_id: 's1', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o3', source_id: 's2', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o4', source_id: 's2', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o5', source_id: 's3', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
    { observation_id: 'o6', source_id: 's3', phasepost_measurements: toMeasurements(dist('A', 0.9)) },
  ];
  const basisId = 'exemplar-basis:sha256:' + '0'.repeat(64);
  const first = await emergeHolons({ basisId, observations, previousHolons: [], policy: { mintOverheadBits: 0.3 } });
  assert.ok(first.holons.length > 0);
  assert.ok(first.holons.every((h) => h.holon_id.startsWith('holon:sha256:')));

  // A second build over the SAME observations, given the first build's
  // holons as "previous," must reuse every id — nothing should churn on a
  // no-op rebuild (SPEC.md §6 identity-across-rebuild).
  const second = await emergeHolons({ basisId, observations, previousHolons: first.holons, policy: { mintOverheadBits: 0.3 } });
  const firstIds = new Set(first.holons.map((h) => h.holon_id));
  const secondIds = new Set(second.holons.map((h) => h.holon_id));
  assert.deepEqual(firstIds, secondIds, 'identical rebuild must be a no-op on holon identity');
  assert.equal(second.identityReboundAudits.length, 0);
});
