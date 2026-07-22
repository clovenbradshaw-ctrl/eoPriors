// src/fold.js — measurement_protocol "eo-fold-compression@1.0.0" (SPEC.md
// §4.4a). Compression of a FOLD (schemas/representation.schema.json) against
// the 27-cell phasepost space — the structural alternative to
// src/compress.js's cosine-against-centroids path. Where compress.js asks
// "which centroid does this span's embedding resemble," this module asks
// "which cell does this span's ALREADY-READ operator evidence belong to,"
// using the cube's own closed-form (operator, grain) → cell mapping
// (data/phasepost-cells.json) instead of a similarity score. Same output
// shape as compress.js's measurePhasepost (phasepost_measurements + diagnostics
// + measurement_id), so src/emergence.js, src/basis-select.js and src/replay.js
// consume either protocol's output identically — invariant 5's "27 values,
// not just the winner" is satisfied by construction here, not by convention.

import { contentRef, canonicalize } from './event.js';
import { entropyMicrobits } from './compress.js';

export const FOLD_MEASUREMENT_PROTOCOL = 'eo-fold-compression@1.0.0';

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
const PPM = 1_000_000;
const clampPpm = (x) => Math.max(-PPM, Math.min(PPM, Math.round(x)));

let cachedCells = null;

// The same vendored cube geometry basis-select.js's CELL_KEYS constant
// hand-repeats — loaded here, not repeated, so operator/grain → cell can
// never drift from data/phasepost-cells.json's own authority over that
// mapping (the file's own _ comment: "must never drift apart").
export async function loadPhasepostCells({ fetchImpl, url } = {}) {
  if (cachedCells) return cachedCells;
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL(url || '../data/phasepost-cells.json', import.meta.url));
    cachedCells = JSON.parse(await readFile(path, 'utf8'));
    return cachedCells;
  }
  const impl = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!impl) throw new Error('loadPhasepostCells: no fetch available in this environment');
  const resolvedUrl = url || new URL('../data/phasepost-cells.json', import.meta.url).href;
  const res = await impl(resolvedUrl);
  if (!res.ok) throw new Error(`loadPhasepostCells: fetch ${resolvedUrl} → ${res.status}`);
  cachedCells = await res.json();
  return cachedCells;
}

// (operator, grain) → cell key, inverted once from the cells table rather
// than hand-maintained — the table already fully determines it (each
// operator's three cells are exactly its Ground/Figure/Pattern grain).
export function buildOperatorGrainIndex(cellsBundle) {
  const index = {};
  for (const [cellKey, def] of Object.entries(cellsBundle.cells)) {
    index[`${def.op}:${def.grain}`] = cellKey;
  }
  return index;
}

const cellKeyFor = (index, op, grain) => {
  const key = index[`${op}:${grain}`];
  if (!key) throw new Error(`fold.js: no cell for operator "${op}" at grain "${grain}" — check data/phasepost-cells.json`);
  return key;
};

// A held span with no operator_events is not "no measurement" — it is the
// reader's own report that nothing transformed (representation.schema.json's
// `fold.held` doc comment). NUL's grain-Figure cell is exactly "hold
// (non-transformation)" read at the specific committed span, not the ambient
// Ground condition — see data/phasepost-cells.json's NUL label.
const HOLD_OPERATOR = 'NUL';
const HOLD_GRAIN = 'Figure';

// Every declared operator/grain cell in the cube, so a fold with sparse
// evidence still reports all 27 (invariant 5) — cells the fold said nothing
// about score zero, exactly like compress.js's negative-cosine cells.
export function foldToRawWeights(fold, cellsBundle) {
  const index = buildOperatorGrainIndex(cellsBundle);
  const weights = Object.fromEntries(Object.keys(cellsBundle.cells).map((c) => [c, 0]));
  const events = (fold.operator_events && fold.operator_events.length)
    ? fold.operator_events
    : (fold.held ? [{ op: HOLD_OPERATOR, grain: HOLD_GRAIN, weight_ppm: PPM }] : []);
  for (const { op, grain, weight_ppm } of events) {
    const cell = cellKeyFor(index, op, grain);
    weights[cell] += weight_ppm;
  }
  return weights;
}

// Same amplitude contract as compress.js's toPhasepostMeasurements: clip
// negatives (never produced here, since weight_ppm is non-negative by
// schema, but kept symmetric with the cosine path), renormalize the positive
// remainder to sum to exactly PPM, last cell absorbs rounding. similarity_ppm
// here carries the fold's OWN raw weight (not a cosine — there is no
// embedding in this path), scaled down if the sum of all events exceeds one
// span's PPM budget, so it stays a valid ppmInteger without pretending to be
// a similarity score it never was.
export function toFoldMeasurements(rawWeights) {
  const sum = Object.values(rawWeights).reduce((a, b) => a + b, 0);
  const scale = sum > PPM ? PPM / sum : 1;
  const measurements = {};
  let allocated = 0;
  const keys = Object.keys(rawWeights);
  keys.forEach((cell, i) => {
    const isLast = i === keys.length - 1;
    const amplitude_ppm = sum > 0
      ? (isLast ? PPM - allocated : Math.round((rawWeights[cell] / sum) * PPM))
      : 0;
    allocated += isLast ? 0 : amplitude_ppm;
    measurements[cell] = {
      similarity_ppm: clampPpm(rawWeights[cell] * scale),
      amplitude_ppm: Math.max(0, amplitude_ppm),
    };
  });
  return measurements;
}

export function diagnosticsForFold(phasepostMeasurements, fold) {
  const probabilities = {};
  let totalSupportedAmplitude = 0;
  for (const [cell, m] of Object.entries(phasepostMeasurements)) {
    probabilities[cell] = m.amplitude_ppm / PPM;
    totalSupportedAmplitude += m.amplitude_ppm;
  }
  return {
    entropy_microunits: entropyMicrobits(probabilities),
    total_supported_amplitude: totalSupportedAmplitude,
    // Reader-native diagnostics, additive to measurement.schema.json's
    // diagnostics (additionalProperties: true there) — not overwriting the
    // cosine path's fields, since the two protocols can appear side by side
    // in one projection during the transition the essay describes.
    reader_version: fold.reader_version,
    lens_id: fold.lens_id,
    surprisal_bits: fold.surprisal_bits,
    bayes_bits: fold.bayes_bits,
    held: fold.held,
  };
}

// The full measurement, content-addressed exactly like measurePhasepost —
// same call shape (basisId in, {measurement_id, basis_id, ...} out) so a
// caller building observation.measured doesn't need to know which protocol
// produced the phasepost_measurements it's wrapping.
export async function measureFold({ fold, cellsBundle, basisId }) {
  const bundle = cellsBundle || await loadPhasepostCells();
  const rawWeights = foldToRawWeights(fold, bundle);
  const phasepost_measurements = toFoldMeasurements(rawWeights);
  const diagnostics = diagnosticsForFold(phasepost_measurements, fold);
  const measurement_id = await contentRef('measurement', canonicalize({
    basis_id: basisId,
    measurement_protocol: FOLD_MEASUREMENT_PROTOCOL,
    phasepost_measurements,
    diagnostics,
  }));
  return {
    measurement_id,
    basis_id: basisId,
    measurement_protocol: FOLD_MEASUREMENT_PROTOCOL,
    phasepost_measurements,
    diagnostics,
  };
}
