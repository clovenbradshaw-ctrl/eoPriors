#!/usr/bin/env node
// scripts/content-vs-structure-genre-experiment.mjs — head-to-head twin of
// genre-discrimination-experiment.mjs: the SAME corpus, the SAME per-book
// spans, the SAME same-category/cross-category pairwise-correlation gap
// statistic, the SAME permutation test — computed for BOTH channels at once
// instead of fold.js alone:
//
//   fold channel     measureFold(fold)                — structure (operator/
//                     grain evidence against the closed-form cube geometry,
//                     data/phasepost-cells.json; no embedding, no fitting)
//   content channel   measurePhasepost(text, embedder) — content (a real
//                     embedder scored against the vendored 27-centroid basis,
//                     data/centroids-27.json; needs the fitted basis)
//
// Motivating question (not assumed, tested): every prior validation script in
// this repo (genre-discrimination, cross-modal-probe, native-metaphor, music-
// fold-probe, dna-fold-probe) runs fold.js only — compress.js has never been
// exercised past test/compress.test.js's synthetic fixtures. If content
// surprise has no universal floor the way structure's closed-form 27-cell
// grammar does, pooling content correlation past genre should degrade faster
// than fold's already-measured +0.121 gap (p=0.007 on 55 books) — this
// script is what actually checks that, rather than leaving it a plausible
// but untested asymmetry.
//
// Two content views are reported, not one, because the fold channel's
// EXCLUDED cells (EVA_Binding_Lens, REC_Making_Lens) are excluded for a
// FOLD-specific reason — reading.js's own EVA/REC acts fire on ~every span
// regardless of content, so those two cells carry no genre signal for the
// STRUCTURE channel by construction. That reason does not obviously transfer
// to the CONTENT channel: there is no mechanism in compress.js that makes an
// embedding's cosine similarity to those two particular archetypes fire
// unconditionally. So contentAll27 (no exclusion — the content channel's own
// natural default) is the primary comparison; contentMatchedExclusion (same
// two cells dropped, for a strictly matched cell-set) is reported alongside
// it so the choice of cell set is never silently deciding the answer.
//
// All three channels (fold, contentAll27, contentMatchedExclusion) are
// permutation-tested against the IDENTICAL shuffle draws (one shared set of
// label permutations, not three independently-random ones), so the observed
// gaps and p-values are directly comparable rather than each carrying its own
// sampling noise on top of the real difference being measured.
//
// Usage: node scripts/content-vs-structure-genre-experiment.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--permutations N]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { measurePhasepost, loadCentroids } from '../src/compress.js';
import { createEmbedder } from '../src/embed.js';
import { accumulate, normalize, restrictAndRenormalize } from './lib/prior-crossval.mjs';
import { pearson, mean } from './lib/stats.mjs';
import { parseManifestCsv } from './lib/manifest-csv.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const CONTENT_BASIS_ID = 'exemplar-basis:sha256:' + 'c'.repeat(64); // the real vendored 27-centroid basis (data/centroids-27.json), not a placeholder — this id just labels the measurement record
const EXCLUDED = ['EVA_Binding_Lens', 'REC_Making_Lens'];

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    spansPerBook: Number(get('--spans-per-book', 20)),
    maxSentences: Number(get('--max-sentences', 300)),
    permutations: Number(get('--permutations', 2000)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

function shuffled(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// pairwise Pearson correlation for every book pair, given a per-book vec()
// accessor — shared by all three channels so the SAME pair ordering underlies
// each channel's gapFor(), which is what lets one shuffle sequence score all
// three at once.
function pairwiseCorr(validFiles, vec) {
  const pairs = [];
  for (let i = 0; i < validFiles.length; i++) {
    for (let j = i + 1; j < validFiles.length; j++) {
      pairs.push({ a: validFiles[i], b: validFiles[j], corr: pearson(vec(validFiles[i]), vec(validFiles[j])) });
    }
  }
  return pairs;
}

function gapFor(pairs, labels) {
  const same = [], cross = [];
  for (const { a, b, corr } of pairs) (labels[a] === labels[b] ? same : cross).push(corr);
  return mean(same) - mean(cross);
}

function runChannel(name, pairs, isFiction, validFiles, fictionSet, permutationLabelSets) {
  const observedGap = gapFor(pairs, isFiction);
  let countAsExtreme = 0;
  const nullGaps = [];
  for (const permLabels of permutationLabelSets) {
    const g = gapFor(pairs, permLabels);
    nullGaps.push(g);
    if (g >= observedGap) countAsExtreme++;
  }
  const pValue = (countAsExtreme + 1) / (permutationLabelSets.length + 1);
  return {
    channel: name,
    observedGap: +observedGap.toFixed(4),
    nullMeanGap: +mean(nullGaps).toFixed(4),
    permutations: permutationLabelSets.length,
    pValue: +pValue.toFixed(4),
    interpretation: pValue < 0.05
      ? 'same-category pairs correlate significantly more than cross-category pairs — the signal tracks genre'
      : 'no significant genre discrimination detected at p<0.05',
  };
}

async function main() {
  const { corpusDir, spansPerBook, maxSentences, permutations, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: content-vs-structure-genre-experiment.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--permutations N]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const centroids = await loadCentroids();
  const embedder = createEmbedder();
  console.error('warming up the embedder (first run downloads the model)...');
  await embedder.warm();
  console.error('embedder warm.\n');

  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));
  const allCellKeys = Object.keys(cellsBundle.cells);
  const manifestById = parseManifestCsv(readFileSync(`${corpusDir}/manifest.csv`, 'utf8'));

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, ~${spansPerBook} spans/book, ${permutations} permutations\n`);

  const foldProfile = {};
  const contentAllProfile = {};
  const contentMatchedProfile = {};
  const isFiction = {};

  for (const file of files) {
    const id = file.replace(/^pg/, '').replace(/\.txt$/, '');
    const row = manifestById[id];
    if (!row) { console.error(`  skip ${file}: no manifest row for id ${id}`); continue; }
    isFiction[file] = /fiction|stories/i.test(row.subject_key);

    const raw = readFileSync(`${corpusDir}/${file}`, 'utf8');
    let doc;
    try { doc = createParser().parse(stripFrame(raw)); } catch (e) { console.error(`  parse failed ${file}: ${e.message}`); continue; }
    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);
    const span = Math.max(1, Math.floor((end - start) / spansPerBook));

    const foldProbsForBook = [];
    const contentProbsForBook = [];
    for (let i = start, count = 0; i < end && count < spansPerBook; i += span, count++) {
      const reading = readingAt(doc, i);
      const fold = readingToFold(doc, i, reading);
      const foldMeasurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      const foldProbs = {};
      for (const [cell, m] of Object.entries(foldMeasurement.phasepost_measurements)) foldProbs[cell] = m.amplitude_ppm / 1_000_000;
      foldProbsForBook.push(foldProbs);

      const text = String(units[i] || '');
      const contentMeasurement = await measurePhasepost({ text, embedder, centroids, basisId: CONTENT_BASIS_ID });
      const contentProbs = {};
      for (const [cell, m] of Object.entries(contentMeasurement.phasepost_measurements)) contentProbs[cell] = m.amplitude_ppm / 1_000_000;
      contentProbsForBook.push(contentProbs);
    }

    foldProfile[file] = normalize(accumulate(restrictAndRenormalize(foldProbsForBook, contentCellKeys), contentCellKeys), contentCellKeys);
    contentAllProfile[file] = normalize(accumulate(restrictAndRenormalize(contentProbsForBook, allCellKeys), allCellKeys), allCellKeys);
    contentMatchedProfile[file] = normalize(accumulate(restrictAndRenormalize(contentProbsForBook, contentCellKeys), contentCellKeys), contentCellKeys);
    console.error(`  ${file}: fiction=${isFiction[file]}  subject="${row.subject_key}"`);
  }

  const validFiles = files.filter((f) => foldProfile[f] !== undefined);
  const fictionCount = validFiles.filter((f) => isFiction[f]).length;
  console.error(`\n${validFiles.length} books scored; ${fictionCount} fiction, ${validFiles.length - fictionCount} non-fiction\n`);

  const foldPairs = pairwiseCorr(validFiles, (f) => contentCellKeys.map((c) => foldProfile[f][c]));
  const contentAllPairs = pairwiseCorr(validFiles, (f) => allCellKeys.map((c) => contentAllProfile[f][c]));
  const contentMatchedPairs = pairwiseCorr(validFiles, (f) => contentCellKeys.map((c) => contentMatchedProfile[f][c]));

  const fictionSet = validFiles.filter((f) => isFiction[f]);
  const permutationLabelSets = [];
  for (let p = 0; p < permutations; p++) {
    const shuffledAll = shuffled(validFiles);
    const permLabels = {};
    shuffledAll.forEach((f, idx) => { permLabels[f] = idx < fictionSet.length; });
    permutationLabelSets.push(permLabels);
  }

  const foldResult = runChannel('fold (structure)', foldPairs, isFiction, validFiles, fictionSet, permutationLabelSets);
  const contentAllResult = runChannel('content-all27 (embedding, no exclusion)', contentAllPairs, isFiction, validFiles, fictionSet, permutationLabelSets);
  const contentMatchedResult = runChannel('content-matched-exclusion (embedding, EVA/REC cells dropped)', contentMatchedPairs, isFiction, validFiles, fictionSet, permutationLabelSets);

  console.log(JSON.stringify({
    totalBooks: validFiles.length,
    fictionCount,
    nonFictionCount: validFiles.length - fictionCount,
    totalPairs: foldPairs.length,
    permutations,
    fold: foldResult,
    contentAll27: contentAllResult,
    contentMatchedExclusion: contentMatchedResult,
    comparison: {
      foldGapMinusContentAll27Gap: +(foldResult.observedGap - contentAllResult.observedGap).toFixed(4),
      foldGapMinusContentMatchedGap: +(foldResult.observedGap - contentMatchedResult.observedGap).toFixed(4),
      note: 'a positive value here means the fold (structure) gap is LARGER than the content gap on this corpus — i.e. content-cell correlation collapsed more when pooled past genre than fold-cell correlation did, which is the asymmetry under test.',
    },
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
