// src/compress.js — measurement_protocol "eo-compression@1.0.0" (SPEC.md §4.4).
// Compression against an active basis: embed a span, score it against every
// one of the 27 phasepost centroids, and report the full distribution — never
// an argmax winner (invariant 5, invariant 7 of acceptance criteria). The
// centroids are the eo-lexical-analysis-2.0 instrument, vendored at
// data/centroids-27.json (see that file's `vendored_into`).

import { contentRef, canonicalize } from './event.js';

export const MEASUREMENT_PROTOCOL = 'eo-compression@1.0.0';

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

// The vendored bundle, loaded once per process/session and reused — it is
// vendored precisely so no network fetch (beyond the one same-origin/disk
// read below) is required for a "reproduced" projection to rebuild.
let cachedBundle = null;

export async function loadCentroids({ fetchImpl, url } = {}) {
  if (cachedBundle) return cachedBundle;
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL(url || '../data/centroids-27.json', import.meta.url));
    cachedBundle = JSON.parse(await readFile(path, 'utf8'));
    return cachedBundle;
  }
  const impl = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!impl) throw new Error('loadCentroids: no fetch available in this environment');
  const resolvedUrl = url || new URL('../data/centroids-27.json', import.meta.url).href;
  const res = await impl(resolvedUrl);
  if (!res.ok) throw new Error(`loadCentroids: fetch ${resolvedUrl} → ${res.status}`);
  cachedBundle = await res.json();
  return cachedBundle;
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
};

const PPM = 1_000_000;
const clampPpm = (x) => Math.max(-PPM, Math.min(PPM, Math.round(x * PPM)));

// Raw cosine similarity against all 27 centroids — the un-normalized reading,
// before amplitude/entropy are derived from it.
export function scoreAgainstCentroids(queryVector, centroidBundle) {
  const scores = {};
  for (const [cellKey, vec] of Object.entries(centroidBundle.vectors)) {
    scores[cellKey] = cosine(queryVector, vec);
  }
  return scores;
}

// entropy of a probability vector, in bits (log base 2), scaled to
// micro-bits. 0-probability cells contribute 0 (the standard 0·log(0) := 0
// convention), so a fully-uncommitted (uniform) distribution over 27 cells
// reads as its maximum, log2(27) ≈ 4.755 bits, and a one-hot distribution
// reads as 0.
export function entropyMicrobits(probabilities) {
  let bits = 0;
  for (const p of Object.values(probabilities)) {
    if (p > 0) bits += -p * Math.log2(p);
  }
  return Math.round(bits * 1e6);
}

// similarity_ppm (can be negative — the raw cosine) and amplitude_ppm (a
// proper non-negative distribution: negative cosines clipped to zero, the
// positive remainder renormalized to sum to ~1e6) for every cell. Amplitude,
// not raw cosine, is what src/emergence.js treats as a probability vector —
// a negative cosine is "actively unlike this cell," which contributes zero
// mass, not negative mass.
export function toPhasepostMeasurements(rawScores) {
  const positive = {};
  let sum = 0;
  for (const [cell, s] of Object.entries(rawScores)) {
    const p = Math.max(0, s);
    positive[cell] = p;
    sum += p;
  }
  const measurements = {};
  let allocated = 0;
  const keys = Object.keys(rawScores);
  keys.forEach((cell, i) => {
    const isLast = i === keys.length - 1;
    const amplitude_ppm = sum > 0
      ? (isLast ? PPM - allocated : Math.round((positive[cell] / sum) * PPM))
      : 0;
    allocated += isLast ? 0 : amplitude_ppm;
    measurements[cell] = {
      similarity_ppm: clampPpm(rawScores[cell]),
      amplitude_ppm: Math.max(0, amplitude_ppm),
    };
  });
  return measurements;
}

export function diagnosticsFor(phasepostMeasurements) {
  const probabilities = {};
  let totalSupportedAmplitude = 0;
  for (const [cell, m] of Object.entries(phasepostMeasurements)) {
    probabilities[cell] = m.amplitude_ppm / PPM;
    totalSupportedAmplitude += m.amplitude_ppm;
  }
  return {
    entropy_microunits: entropyMicrobits(probabilities),
    total_supported_amplitude: totalSupportedAmplitude,
  };
}

// The full measurement: embed `text`, score against the active basis's
// centroids, and package a record shaped exactly like
// schemas/measurement.schema.json (minus the ids, which the caller wraps
// this in when building the actual observation.measured / candidate.scored
// event — measurement_id is content-addressed here so it never depends on
// which event wraps it).
export async function measurePhasepost({ text, embedder, centroids, basisId }) {
  const vec = await embedder.embed(text);
  const raw = scoreAgainstCentroids(vec, centroids);
  const phasepost_measurements = toPhasepostMeasurements(raw);
  const diagnostics = diagnosticsFor(phasepost_measurements);
  const measurement_id = await contentRef('measurement', canonicalize({
    basis_id: basisId,
    measurement_protocol: MEASUREMENT_PROTOCOL,
    phasepost_measurements,
    diagnostics,
  }));
  return {
    measurement_id,
    basis_id: basisId,
    measurement_protocol: MEASUREMENT_PROTOCOL,
    phasepost_measurements,
    diagnostics,
  };
}
