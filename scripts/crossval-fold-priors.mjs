#!/usr/bin/env node
// scripts/crossval-fold-priors.mjs — does the aggregate 27-cell distribution
// generalize? K-fold cross-validation: build a "prior" (a probability
// distribution over the 27 phasepost cells) from a TRAIN set of books' real
// folds, then measure how well that prior predicts a disjoint HELD-OUT set's
// actual cell distribution — span by span, using each span's own (possibly
// multi-cell) fold probability, not a crude single-label guess. Compared
// against two baselines:
//   - uniform: no information at all (flat over the cell set)
//   - single-book: one train book's own distribution (small-sample noise) —
//     shows whether AGGREGATING across many books beats any one book alone
//
// Reports in bits: cross-entropy (lower is better) and KL(heldout || Q) =
// crossEntropy - entropy(heldout), which isolates the AVOIDABLE cost of an
// imperfect prior from the held-out set's own irreducible entropy.
//
// Two views: all 27 cells (dominated by EVA/REC, which fire on ~every span
// regardless of genre — trivially easy for any prior), and content-only
// (excludes EVA_Binding_Lens/REC_Making_Lens, the harder test of whether the
// prior captures real cross-document structure in the rarer operators).
//
// Deterministic k-fold split by sorted filename (no Math.random — reproducible).
//
// Usage:
//   node scripts/crossval-fold-priors.mjs --corpus-dir <dir> [--k-folds N] [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize, restrictAndRenormalize, crossEntropy, entropyOfSpans } from './lib/prior-crossval.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const EXCLUDED_FROM_CONTENT_VIEW = ['EVA_Binding_Lens', 'REC_Making_Lens'];

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    kFolds: Number(get('--k-folds', 4)),
    maxSentences: Number(get('--max-sentences', 300)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

async function readBookSpans(file, createParser, readingAt, cellsBundle, maxSentences) {
  const raw = readFileSync(file, 'utf8');
  let doc;
  try {
    doc = createParser().parse(stripFrame(raw));
  } catch (e) {
    console.error(`  parse failed on ${file}: ${e.message}`);
    return [];
  }
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

function scoreView(heldOutSpans, trainSpans, singleBookSpans, cellKeys) {
  const heldOutR = restrictAndRenormalize(heldOutSpans, cellKeys);
  const trainR = restrictAndRenormalize(trainSpans, cellKeys);
  const singleR = restrictAndRenormalize(singleBookSpans, cellKeys);
  const Ptrain = normalize(accumulate(trainR, cellKeys), cellKeys);
  const Psingle = normalize(accumulate(singleR, cellKeys), cellKeys);
  const Puniform = Object.fromEntries(cellKeys.map((c) => [c, 1 / cellKeys.length]));

  const h = entropyOfSpans(heldOutR, cellKeys);
  const ceTrain = crossEntropy(heldOutR, Ptrain, cellKeys);
  const ceSingle = crossEntropy(heldOutR, Psingle, cellKeys);
  const ceUniform = crossEntropy(heldOutR, Puniform, cellKeys);
  return {
    entropyHeldout: h, crossEntropyTrain: ceTrain, crossEntropySingleBook: ceSingle, crossEntropyUniform: ceUniform,
    klTrain: ceTrain - h, klSingle: ceSingle - h, klUniform: ceUniform - h,
  };
}

async function main() {
  const { corpusDir, kFolds, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: crossval-fold-priors.mjs --corpus-dir <dir> [--k-folds N] [--max-sentences N] [--eoreader-path <path>]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const cellKeys = Object.keys(cellsBundle.cells);
  const contentCellKeys = cellKeys.filter((c) => !EXCLUDED_FROM_CONTENT_VIEW.includes(c));

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, ${kFolds}-fold CV, up to ${maxSentences} sentences/book\n`);

  const bookSpans = {};
  for (const file of files) {
    bookSpans[file] = await readBookSpans(`${corpusDir}/${file}`, createParser, readingAt, cellsBundle, maxSentences);
    console.error(`  read ${file}: ${bookSpans[file].length} spans`);
  }

  const foldResults = [];
  for (let k = 0; k < kFolds; k++) {
    const heldOutFiles = files.filter((_, i) => i % kFolds === k);
    const trainFiles = files.filter((_, i) => i % kFolds !== k);
    const trainSpans = trainFiles.flatMap((f) => bookSpans[f]);
    const heldOutSpans = heldOutFiles.flatMap((f) => bookSpans[f]);
    const singleBookSpans = bookSpans[trainFiles[0]];

    const all27 = scoreView(heldOutSpans, trainSpans, singleBookSpans, cellKeys);
    const contentOnly = scoreView(heldOutSpans, trainSpans, singleBookSpans, contentCellKeys);

    const EPS_TOL = 1e-9;
    for (const [label, view] of [['all27', all27], ['contentOnly', contentOnly]]) {
      for (const k2 of ['klTrain', 'klSingle', 'klUniform']) {
        if (view[k2] < -EPS_TOL) console.error(`  WARNING fold ${k}: ${label}.${k2} = ${view[k2]} < 0 — normalization bug`);
      }
    }

    foldResults.push({ fold: k, trainBooks: trainFiles.length, heldOutBooks: heldOutFiles.length, heldOutSpans: heldOutSpans.length, all27, contentOnly });
  }

  console.log(JSON.stringify({ kFolds, totalBooks: files.length, foldResults }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
