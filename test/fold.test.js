import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPhasepostCells, buildOperatorGrainIndex, foldToRawWeights, toFoldMeasurements,
  diagnosticsForFold, measureFold, FOLD_MEASUREMENT_PROTOCOL,
} from '../src/fold.js';

const readerVersion = 'eoreader4.2@1.0.0';
const lensId = 'recency@γ0.70';

const baseFold = (overrides = {}) => ({
  reader_version: readerVersion,
  lens_id: lensId,
  operator_events: [],
  surprisal_bits: 0,
  bayes_bits: 0,
  held: false,
  ...overrides,
});

test('buildOperatorGrainIndex fully determines all 27 cells from the cube geometry', async () => {
  const bundle = await loadPhasepostCells();
  const index = buildOperatorGrainIndex(bundle);
  assert.equal(Object.keys(index).length, 27);
  assert.equal(index['INS:Figure'], 'INS_Making_Entity');
  assert.equal(index['CON:Ground'], 'CON_Tending_Field');
  assert.equal(index['REC:Pattern'], 'REC_Composing_Paradigm');
});

test('a held span with no operator_events folds to NUL_Dissecting_Entity, not an empty measurement', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({ held: true });
  const weights = foldToRawWeights(fold, bundle);
  assert.equal(Object.keys(weights).length, 27);
  const [topCell] = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
  assert.equal(topCell, 'NUL_Dissecting_Entity');
});

test('a non-held span with no operator_events (reader ran but declined the hold convention) reports all-zero weights, not a phantom NUL', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({ held: false, operator_events: [] });
  const weights = foldToRawWeights(fold, bundle);
  assert.ok(Object.values(weights).every((w) => w === 0));
});

test('an INS event at Figure grain routes to INS_Making_Entity, distinct from the same operator at Ground/Pattern', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({ operator_events: [{ op: 'INS', grain: 'Figure', weight_ppm: 1_000_000 }] });
  const weights = foldToRawWeights(fold, bundle);
  assert.equal(weights.INS_Making_Entity, 1_000_000);
  assert.equal(weights.INS_Cultivating_Void, 0);
  assert.equal(weights.INS_Composing_Kind, 0);
});

test('toFoldMeasurements always returns exactly 27 cells summing amplitude to 1e6, never negative', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({
    operator_events: [
      { op: 'CON', grain: 'Figure', weight_ppm: 600_000 },
      { op: 'SIG', grain: 'Figure', weight_ppm: 400_000 },
    ],
  });
  const weights = foldToRawWeights(fold, bundle);
  const measurements = toFoldMeasurements(weights);
  assert.equal(Object.keys(measurements).length, 27);
  const total = Object.values(measurements).reduce((sum, m) => sum + m.amplitude_ppm, 0);
  assert.equal(total, 1_000_000);
  for (const m of Object.values(measurements)) {
    assert.ok(Number.isInteger(m.similarity_ppm));
    assert.ok(Number.isInteger(m.amplitude_ppm));
    assert.ok(m.amplitude_ppm >= 0);
  }
  assert.equal(measurements.CON_Binding_Link.amplitude_ppm, 600_000);
  assert.equal(measurements.SIG_Binding_Entity.amplitude_ppm, 400_000);
});

test('events whose combined weight exceeds one span budget are scaled down in similarity_ppm, not clipped into a lie', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({
    operator_events: [
      { op: 'CON', grain: 'Figure', weight_ppm: 900_000 },
      { op: 'SIG', grain: 'Figure', weight_ppm: 900_000 },
    ],
  });
  const weights = foldToRawWeights(fold, bundle);
  const measurements = toFoldMeasurements(weights);
  const total = Object.values(measurements).reduce((sum, m) => sum + m.amplitude_ppm, 0);
  assert.equal(total, 1_000_000);
  assert.ok(measurements.CON_Binding_Link.similarity_ppm <= 1_000_000);
  assert.ok(measurements.SIG_Binding_Entity.similarity_ppm <= 1_000_000);
});

test('diagnosticsForFold carries reader_version, lens_id and both surprisal channels alongside entropy', async () => {
  const bundle = await loadPhasepostCells();
  const fold = baseFold({
    operator_events: [{ op: 'DEF', grain: 'Figure', weight_ppm: 1_000_000 }],
    surprisal_bits: 2_500_000,
    bayes_bits: 1_800_000,
  });
  const weights = foldToRawWeights(fold, bundle);
  const measurements = toFoldMeasurements(weights);
  const diag = diagnosticsForFold(measurements, fold);
  assert.equal(diag.reader_version, readerVersion);
  assert.equal(diag.lens_id, lensId);
  assert.equal(diag.surprisal_bits, 2_500_000);
  assert.equal(diag.bayes_bits, 1_800_000);
  assert.equal(diag.held, false);
  assert.ok(Number.isInteger(diag.entropy_microunits));
});

test('measureFold end-to-end produces a schema-shaped measurement under the fold protocol', async () => {
  const basisId = 'exemplar-basis:sha256:' + '0'.repeat(64);
  const fold = baseFold({
    operator_events: [{ op: 'REC', grain: 'Pattern', weight_ppm: 1_000_000 }],
    surprisal_bits: 4_000_000,
    bayes_bits: 3_000_000,
  });
  const measurement = await measureFold({ fold, basisId });

  assert.equal(measurement.measurement_protocol, FOLD_MEASUREMENT_PROTOCOL);
  assert.equal(measurement.basis_id, basisId);
  assert.ok(measurement.measurement_id.startsWith('measurement:sha256:'));
  assert.equal(Object.keys(measurement.phasepost_measurements).length, 27);
  const [topCell] = Object.entries(measurement.phasepost_measurements)
    .sort((a, b) => b[1].amplitude_ppm - a[1].amplitude_ppm)[0];
  assert.equal(topCell, 'REC_Composing_Paradigm');
});

test('measureFold is deterministic: the same fold content always content-addresses to the same measurement_id', async () => {
  const basisId = 'exemplar-basis:sha256:' + '1'.repeat(64);
  const fold = baseFold({ operator_events: [{ op: 'SEG', grain: 'Figure', weight_ppm: 1_000_000 }] });
  const a = await measureFold({ fold, basisId });
  const b = await measureFold({ fold: { ...fold }, basisId });
  assert.equal(a.measurement_id, b.measurement_id);
});
