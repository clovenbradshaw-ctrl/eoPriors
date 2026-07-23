#!/usr/bin/env node
// scripts/content-vs-structure-cross-modal-experiment.mjs — cross-modal-probe's
// equivalent of content-vs-structure-genre-experiment.mjs. cross-modal-probe.mjs
// itself only reports descriptive per-file operator distributions (no gap
// statistic), so this script adds the SAME same-category/cross-category
// pairwise-correlation permutation-gap statistic genre-discrimination uses,
// applied to the diverse corpus (English prose, non-English prose, source
// code) instead of the fiction/non-fiction split — for BOTH channels at once:
//
//   fold channel     measureFold(fold)                — structure
//   content channel  measurePhasepost(text, embedder) — content
//
// Category split: isProse (English + non-English books) vs isCode (source
// files) — the sharpest version of cross-modal-probe's own question ("does
// the reader generalize past English public-domain prose?"), and the level
// at which the earlier synthesis claims structure has already been shown to
// generalize (English/German/Spanish/Finnish, prose vs code) while content
// has never been tested past a single document. If content has no universal
// floor, its prose-vs-code gap should collapse harder than fold's.
//
// Small-N caveat (inherited from cross-modal-probe.mjs's own "small on
// purpose" framing): this corpus is ~10 files, not 55 books, so the
// permutation test here has much less power than the genre experiment's —
// report the observed gap and p-value honestly, don't over-read borderline
// significance either way.
//
// Usage: node scripts/content-vs-structure-cross-modal-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--permutations N]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { measurePhasepost, loadCentroids } from '../src/compress.js';
import { createEmbedder } from '../src/embed.js';
import { accumulate, normalize, restrictAndRenormalize } from './lib/prior-crossval.mjs';
import { pearson, mean } from './lib/stats.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const CONTENT_BASIS_ID = 'exemplar-basis:sha256:' + 'c'.repeat(64);
const EXCLUDED = ['EVA_Binding_Lens', 'REC_Making_Lens'];
const CODE_EXTS = ['.py', '.go', '.rs', '.c'];

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    maxSentences: Number(get('--max-sentences', 150)),
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

function runChannel(name, pairs, permutationLabelSets, observedGap) {
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
      ? 'same-category (prose/prose or code/code) pairs correlate significantly more than cross-category (prose/code) pairs'
      : 'no significant prose-vs-code discrimination detected at p<0.05 (small-N probe — absence of significance is not strong evidence of absence)',
  };
}

async function main() {
  const { corpusDir, maxSentences, permutations, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) { console.error('usage: content-vs-structure-cross-modal-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--permutations N]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const centroids = await loadCentroids();
  const embedder = createEmbedder();
  console.error('warming up the embedder...');
  await embedder.warm();
  console.error('embedder warm.\n');

  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));
  const allCellKeys = Object.keys(cellsBundle.cells);
  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt') || CODE_EXTS.some((e) => f.endsWith(e))).sort();
  console.error(`${files.length} files, up to ${maxSentences} spans/file, ${permutations} permutations\n`);

  const foldProfile = {};
  const contentAllProfile = {};
  const contentMatchedProfile = {};
  const isCode = {};

  for (const file of files) {
    isCode[file] = CODE_EXTS.some((e) => file.endsWith(e));
    const raw = readFileSync(`${corpusDir}/${file}`, 'utf8');
    let doc, err = null;
    try { doc = createParser().parse(stripFrame(raw)); } catch (e) { err = e.message; }
    if (err) { console.error(`  ${file}: PARSE ERROR: ${err}`); continue; }

    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);

    const foldProbsForFile = [];
    const contentProbsForFile = [];
    for (let i = start; i < end; i++) {
      const reading = readingAt(doc, i, { terrains: true });
      const fold = readingToFold(doc, i, reading);
      const foldMeasurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      const foldProbs = {};
      for (const [cell, m] of Object.entries(foldMeasurement.phasepost_measurements)) foldProbs[cell] = m.amplitude_ppm / 1_000_000;
      foldProbsForFile.push(foldProbs);

      const text = String(units[i] || '');
      const contentMeasurement = await measurePhasepost({ text, embedder, centroids, basisId: CONTENT_BASIS_ID });
      const contentProbs = {};
      for (const [cell, m] of Object.entries(contentMeasurement.phasepost_measurements)) contentProbs[cell] = m.amplitude_ppm / 1_000_000;
      contentProbsForFile.push(contentProbs);
    }

    foldProfile[file] = normalize(accumulate(restrictAndRenormalize(foldProbsForFile, contentCellKeys), contentCellKeys), contentCellKeys);
    contentAllProfile[file] = normalize(accumulate(restrictAndRenormalize(contentProbsForFile, allCellKeys), allCellKeys), allCellKeys);
    contentMatchedProfile[file] = normalize(accumulate(restrictAndRenormalize(contentProbsForFile, contentCellKeys), contentCellKeys), contentCellKeys);
    console.error(`  ${file}: code=${isCode[file]} spans=${foldProbsForFile.length}`);
  }

  const validFiles = files.filter((f) => foldProfile[f] !== undefined);
  const codeCount = validFiles.filter((f) => isCode[f]).length;
  console.error(`\n${validFiles.length} files scored; ${codeCount} code, ${validFiles.length - codeCount} prose\n`);

  const foldPairs = pairwiseCorr(validFiles, (f) => contentCellKeys.map((c) => foldProfile[f][c]));
  const contentAllPairs = pairwiseCorr(validFiles, (f) => allCellKeys.map((c) => contentAllProfile[f][c]));
  const contentMatchedPairs = pairwiseCorr(validFiles, (f) => contentCellKeys.map((c) => contentMatchedProfile[f][c]));

  const codeSet = validFiles.filter((f) => isCode[f]);
  const permutationLabelSets = [];
  for (let p = 0; p < permutations; p++) {
    const shuffledAll = shuffled(validFiles);
    const permLabels = {};
    shuffledAll.forEach((f, idx) => { permLabels[f] = idx < codeSet.length; });
    permutationLabelSets.push(permLabels);
  }

  const foldObservedGap = gapFor(foldPairs, isCode);
  const contentAllObservedGap = gapFor(contentAllPairs, isCode);
  const contentMatchedObservedGap = gapFor(contentMatchedPairs, isCode);

  const foldResult = runChannel('fold (structure)', foldPairs, permutationLabelSets, foldObservedGap);
  const contentAllResult = runChannel('content-all27 (embedding, no exclusion)', contentAllPairs, permutationLabelSets, contentAllObservedGap);
  const contentMatchedResult = runChannel('content-matched-exclusion (embedding, EVA/REC cells dropped)', contentMatchedPairs, permutationLabelSets, contentMatchedObservedGap);

  console.log(JSON.stringify({
    totalFiles: validFiles.length,
    codeCount,
    proseCount: validFiles.length - codeCount,
    files: validFiles.map((f) => ({ file: f, isCode: isCode[f] })),
    totalPairs: foldPairs.length,
    permutations,
    fold: foldResult,
    contentAll27: contentAllResult,
    contentMatchedExclusion: contentMatchedResult,
    comparison: {
      foldGapMinusContentAll27Gap: +(foldResult.observedGap - contentAllResult.observedGap).toFixed(4),
      foldGapMinusContentMatchedGap: +(foldResult.observedGap - contentMatchedResult.observedGap).toFixed(4),
      note: 'a positive value here means the fold (structure) prose-vs-code gap is LARGER than the content gap — i.e. content-cell correlation collapsed more across the prose/code boundary than fold-cell correlation did.',
    },
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
