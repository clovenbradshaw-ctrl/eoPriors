#!/usr/bin/env node
// scripts/reading-improvement-experiment.mjs — does the corpus prior improve
// READING, operationalized honestly: does it improve PREDICTION of what the
// next span actually does, compared to using only the document's own local
// history? This is the closest faithful proxy to "improve reading" buildable
// without modifying eoreader4.2's actual source — reading.js has no hook for
// injecting a cell-level external prior (opts.expect only boosts already-
// seen entities' mass, capped, not cell-level prediction).
//
// Three predictors, walked span-by-span through each held-out book IN ORDER
// (an expanding window, exactly how a real reader accumulates history):
//   LOCAL     an empirical distribution over cells from spans 0..i-1 of
//             THIS SAME book only — zero external information, the
//             document-only baseline (uniform at i=0, sharpens as it reads).
//   CORPUS    the fixed aggregate distribution from every OTHER book —
//             never updates, ignores this document's own history entirely.
//   BLENDED   a standard Dirichlet/empirical-Bayes shrinkage: local counts
//             plus alpha "virtual" pseudo-counts shaped like the corpus
//             prior. Small alpha ~ trust local history; large alpha ~ trust
//             the corpus. Swept at a few strengths.
//
// Scored as cross-entropy in bits per span (lower = better prediction),
// split into EARLY (first third of each book) vs LATE (last third) — if the
// corpus prior helps most before a document has built its own history and
// fades as local evidence accumulates, that should show up as a shrinking
// gap from early to late.
//
// Usage: node scripts/reading-improvement-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize, restrictAndRenormalize } from './lib/prior-crossval.mjs';
import { mean, stddev } from './lib/stats.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const EXCLUDED = ['EVA_Binding_Lens', 'REC_Making_Lens'];
const ALPHAS = [3, 10, 30]; // blend strengths: corpus-prior "virtual sample size"
const EPS = 1e-6;

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return { corpusDir: get('--corpus-dir', null), maxSentences: Number(get('--max-sentences', 300)), eoreaderPath: get('--eoreader-path', undefined) };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

async function readBookSpans(file, createParser, readingAt, cellsBundle, maxSentences) {
  const raw = readFileSync(file, 'utf8');
  let doc;
  try { doc = createParser().parse(stripFrame(raw)); } catch (e) { console.error(`  parse failed on ${file}: ${e.message}`); return []; }
  const units = doc.sentences || doc.units || [];
  const start = Math.min(SKIP_FRONT_MATTER, units.length);
  const end = Math.min(units.length, start + maxSentences);
  const spans = [];
  for (let i = start; i < end; i++) {
    const reading = readingAt(doc, i, { terrains: true });
    const fold = readingToFold(doc, i, reading);
    const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
    const probs = {};
    for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) probs[cell] = m.amplitude_ppm / 1_000_000;
    spans.push(probs);
  }
  return spans;
}

// Cross-entropy contribution of ONE span's own probability vector under Q.
const spanBits = (probs, Q, cellKeys) => {
  let bits = 0;
  for (const c of cellKeys) { const p = probs[c] || 0; if (p > 0) bits += -p * Math.log2(Q[c]); }
  return bits;
};

async function main() {
  const { corpusDir, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) { console.error('usage: reading-improvement-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, up to ${maxSentences} sentences/book\n`);

  const bookSpans = {};
  for (const file of files) {
    const raw = await readBookSpans(`${corpusDir}/${file}`, createParser, readingAt, cellsBundle, maxSentences);
    bookSpans[file] = restrictAndRenormalize(raw, contentCellKeys);
    console.error(`  read ${file}: ${bookSpans[file].length} spans`);
  }

  // predictors: local, corpus, blended@alpha — each collects per-span bits,
  // split early/late by position within its own book.
  const predictorNames = ['local', 'corpus', ...ALPHAS.map((a) => `blend_alpha${a}`)];
  const bitsEarly = Object.fromEntries(predictorNames.map((n) => [n, []]));
  const bitsLate = Object.fromEntries(predictorNames.map((n) => [n, []]));
  const bitsAll = Object.fromEntries(predictorNames.map((n) => [n, []]));

  for (const heldOutFile of files) {
    const spans = bookSpans[heldOutFile];
    if (spans.length < 6) continue; // too short for a meaningful early/late split
    const others = files.filter((f) => f !== heldOutFile);
    const corpusMass = accumulate(others.flatMap((f) => bookSpans[f]), contentCellKeys);
    const Qcorpus = normalize(corpusMass, contentCellKeys);

    const localCount = Object.fromEntries(contentCellKeys.map((c) => [c, 0]));
    let localTotal = 0;
    const thirdIdx = Math.floor(spans.length / 3);

    for (let i = 0; i < spans.length; i++) {
      const actual = spans[i];
      const zone = i < thirdIdx ? 'early' : (i >= spans.length - thirdIdx ? 'late' : null);
      const target = zone === 'early' ? bitsEarly : zone === 'late' ? bitsLate : null;

      const Qlocal = normalize(localTotal > 0 ? { ...localCount } : Object.fromEntries(contentCellKeys.map((c) => [c, EPS])), contentCellKeys);
      const scored = { local: Qlocal, corpus: Qcorpus };
      for (const alpha of ALPHAS) {
        const blendMass = {};
        for (const c of contentCellKeys) blendMass[c] = (localCount[c] || 0) + alpha * Qcorpus[c];
        scored[`blend_alpha${alpha}`] = normalize(blendMass, contentCellKeys);
      }

      for (const name of predictorNames) {
        const b = spanBits(actual, scored[name], contentCellKeys);
        bitsAll[name].push(b);
        if (target) target[name].push(b);
      }

      // update local history AFTER scoring this span (predict-then-observe)
      for (const c of contentCellKeys) localCount[c] += actual[c] || 0;
      localTotal += 1;
    }
    console.error(`  scored ${heldOutFile} (${spans.length} spans)`);
  }

  const report = (bitsByPredictor) => Object.fromEntries(predictorNames.map((n) => {
    const arr = bitsByPredictor[n];
    return [n, { n: arr.length, meanBits: +mean(arr).toFixed(4), stdBits: +stddev(arr).toFixed(4) }];
  }));

  console.log(JSON.stringify({
    totalBooks: files.length,
    contentCellCount: contentCellKeys.length,
    alphasSwept: ALPHAS,
    overall: report(bitsAll),
    earlySpans: report(bitsEarly),
    lateSpans: report(bitsLate),
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
