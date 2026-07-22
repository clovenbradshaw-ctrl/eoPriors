import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCentroids, scoreAgainstCentroids, toPhasepostMeasurements, diagnosticsFor, measurePhasepost, MEASUREMENT_PROTOCOL,
} from '../src/compress.js';

// These tests use a real centroid vector as a stand-in "query embedding"
// (rather than invoking the real MiniLM pipeline, which needs a model
// download) — a query identical to cell X's own centroid must score that
// cell highest, which is exactly the property the math needs to have right.

test('loadCentroids reads the vendored 27-cell bundle (Node fs path)', async () => {
  const bundle = await loadCentroids();
  assert.equal(Object.keys(bundle.vectors).length, 27);
  assert.equal(bundle.meta.dim, 384);
});

test('scoring a centroid against itself yields the top score for that cell', async () => {
  const bundle = await loadCentroids();
  const targetCell = 'INS_Making_Entity';
  const query = bundle.vectors[targetCell];
  const scores = scoreAgainstCentroids(query, bundle);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  assert.equal(sorted[0][0], targetCell);
  assert.ok(sorted[0][1] > 0.999, `expected near-1.0 self-similarity, got ${sorted[0][1]}`);
});

test('toPhasepostMeasurements always returns exactly 27 cells summing amplitude to 1e6', async () => {
  const bundle = await loadCentroids();
  const query = bundle.vectors['CON_Binding_Link'];
  const scores = scoreAgainstCentroids(query, bundle);
  const measurements = toPhasepostMeasurements(scores);
  assert.equal(Object.keys(measurements).length, 27);
  const total = Object.values(measurements).reduce((sum, m) => sum + m.amplitude_ppm, 0);
  assert.equal(total, 1_000_000);
  for (const m of Object.values(measurements)) {
    assert.ok(Number.isInteger(m.similarity_ppm));
    assert.ok(Number.isInteger(m.amplitude_ppm));
    assert.ok(m.amplitude_ppm >= 0);
  }
});

test('diagnosticsFor: a one-hot-like distribution has low entropy, near-zero distributes flatly with high entropy', async () => {
  const bundle = await loadCentroids();
  const peaked = toPhasepostMeasurements(scoreAgainstCentroids(bundle.vectors['SIG_Binding_Entity'], bundle));
  const peakedDiag = diagnosticsFor(peaked);

  const zeroVec = new Float32Array(384); // orthogonal-ish to everything → flat/degenerate distribution
  const flatDiag = diagnosticsFor(toPhasepostMeasurements(scoreAgainstCentroids(zeroVec, bundle)));

  assert.ok(peakedDiag.entropy_microunits < flatDiag.entropy_microunits || flatDiag.total_supported_amplitude === 0,
    'a query identical to one centroid should read as lower-entropy than an all-zero query');
});

test('measurePhasepost end-to-end (fake embedder) produces a schema-shaped measurement', async () => {
  const bundle = await loadCentroids();
  const fakeEmbedder = { embed: async () => bundle.vectors['REC_Composing_Paradigm'] };
  const basisId = 'exemplar-basis:sha256:' + '0'.repeat(64);
  const measurement = await measurePhasepost({ text: 'irrelevant — the fake embedder ignores it', embedder: fakeEmbedder, centroids: bundle, basisId });

  assert.equal(measurement.measurement_protocol, MEASUREMENT_PROTOCOL);
  assert.equal(measurement.basis_id, basisId);
  assert.ok(measurement.measurement_id.startsWith('measurement:sha256:'));
  assert.equal(Object.keys(measurement.phasepost_measurements).length, 27);
  // The target cell need not capture 90%+ of amplitude (other cells can carry
  // real positive correlation in a shared embedding space) — the load-bearing
  // property is that it's still the argmax.
  const [topCell] = Object.entries(measurement.phasepost_measurements).sort((a, b) => b[1].amplitude_ppm - a[1].amplitude_ppm)[0];
  assert.equal(topCell, 'REC_Composing_Paradigm');
});
