#!/usr/bin/env node
// scripts/emergence-on-corpus.mjs — first real run of src/emergence.js
// against real fold observations. Tests: (a) does condensation actually find
// cross-source Patterns in real data, (b) do those Pattern holons' prototypes
// stay expressed in Figure-CUBE-grain cells (confirming emergence.js's
// "Pattern" TIER — a condensation stage — is not the cube's "Paradigm" SITE
// — a Pattern-grain cell; the two share a name but are different axes,
// exactly like the surfer's holonic "grain" isn't the cube's Ground/Figure/
// Pattern grain), (c) does an informed (correlation-ranked) sample condense
// better than a naive one.
//
// PERFORMANCE WARNING: emergence.js's condenseByGain is O(n^2) per round —
// its own doc comment says so and means it. A run at 825 observations (55
// books x 15 spans) silently died on this sandbox (most likely OOM) after
// the reading pass but before condensation finished; ~220 observations
// completed in ~2.7 minutes across four emergeHolons() calls. Keep
// SPANS_PER_BOOK small (this script defaults to 4) unless you've confirmed
// your environment can carry a bigger batch — this is genuinely "a batch's
// worth," not corpus-scale, per the module's own documented scope.
//
// Usage: node scripts/emergence-on-corpus.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { emergeHolons } from '../src/emergence.js';
import { accumulate, normalize, restrictAndRenormalize, zeroExcludedAndRenormalize } from './lib/prior-crossval.mjs';
import { pearson } from './lib/stats.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const EXCLUDED = ['EVA_Binding_Lens', 'REC_Making_Lens'];

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    spansPerBook: Number(get('--spans-per-book', 4)),
    maxSentences: Number(get('--max-sentences', 300)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

const timed = async (label, fn) => {
  const t0 = Date.now();
  console.error(`  [${label}] starting...`);
  const result = await fn();
  console.error(`  [${label}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return result;
};

function summarize(holons) {
  const byGrain = { Figure: [], Pattern: [], Ground: [] };
  for (const h of holons) byGrain[h.grain].push(h);
  return Object.fromEntries(Object.entries(byGrain).map(([grain, hs]) => [grain, {
    count: hs.length,
    avgGainBits: hs.length ? +(hs.reduce((s, h) => s + h.gain_bits, 0) / hs.length).toFixed(4) : 0,
    avgMemberCount: hs.length ? +(hs.reduce((s, h) => s + h.supporting_observation_ids.length, 0) / hs.length).toFixed(2) : 0,
    avgDistinctSources: hs.length ? +(hs.reduce((s, h) => s + h.source_ids.length, 0) / hs.length).toFixed(2) : 0,
    topCellsPerHolon: hs.slice(0, 5).map((h) => Object.entries(h.prototype).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c, p]) => `${c}:${p.toFixed(3)}`)),
  }]));
}

async function main() {
  const { corpusDir, spansPerBook, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: emergence-on-corpus.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--eoreader-path <path>]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, ~${spansPerBook} spans/book sampled\n`);

  const allObservations = []; // { observation_id, source_id, phasepost_measurements }
  const bookContentProbs = {}; // file -> content-only renormalized probs, for correlation ranking

  for (const file of files) {
    const raw = readFileSync(`${corpusDir}/${file}`, 'utf8');
    let doc;
    try { doc = createParser().parse(stripFrame(raw)); } catch (e) { console.error(`  skip ${file}: ${e.message}`); continue; }
    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);
    const span = Math.max(1, Math.floor((end - start) / spansPerBook));
    const contentProbsForBook = [];
    for (let i = start, count = 0; i < end && count < spansPerBook; i += span, count++) {
      const reading = readingAt(doc, i);
      const fold = readingToFold(doc, i, reading);
      const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      allObservations.push({ observation_id: `${file}:${i}`, source_id: file, phasepost_measurements: measurement.phasepost_measurements });
      const probs = {};
      for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) probs[cell] = m.amplitude_ppm / 1_000_000;
      contentProbsForBook.push(probs);
    }
    bookContentProbs[file] = normalize(accumulate(restrictAndRenormalize(contentProbsForBook, contentCellKeys), contentCellKeys), contentCellKeys);
    console.error(`  ${file}: ${contentProbsForBook.length} observations`);
  }

  console.error(`\nTotal observations: ${allObservations.length}\n`);

  const contentOnlyObservations = allObservations.map((o) => ({
    ...o, phasepost_measurements: zeroExcludedAndRenormalize(o.phasepost_measurements, EXCLUDED),
  }));

  // (a) + (b): run real condensation on the naive (as-collected) sample —
  // once on the raw full-27 measurements, once with EVA/REC silenced.
  const naiveResult = await timed(`naive full-27 (n=${allObservations.length})`, () => emergeHolons({ basisId: FOLD_BASIS_ID, observations: allObservations }));
  const naiveContentResult = await timed(`naive content-only (n=${contentOnlyObservations.length})`, () => emergeHolons({ basisId: FOLD_BASIS_ID, observations: contentOnlyObservations }));
  const naiveSummary = summarize(naiveResult.holons);
  const naiveContentSummary = summarize(naiveContentResult.holons);

  // (c) an INFORMED sample: rank books by their own correlation to the
  // corpus-wide aggregate profile (built from ALL books, our validated
  // "prior"), then run condensation on just the observations from the
  // most-representative half of books, vs the least-representative half —
  // does drawing from the more "typical" books condense more readily/find
  // more/better-supported Patterns than drawing from outliers?
  const globalProfile = normalize(accumulate(Object.values(bookContentProbs), contentCellKeys), contentCellKeys);
  const scored = files.filter((f) => bookContentProbs[f]).map((f) => ({
    file: f,
    corr: pearson(contentCellKeys.map((c) => bookContentProbs[f][c]), contentCellKeys.map((c) => globalProfile[c])),
  })).sort((a, b) => b.corr - a.corr);
  const half = Math.floor(scored.length / 2);
  const typicalFiles = new Set(scored.slice(0, half).map((s) => s.file));
  const outlierFiles = new Set(scored.slice(-half).map((s) => s.file));

  const typicalObs = allObservations.filter((o) => typicalFiles.has(o.source_id));
  const outlierObs = allObservations.filter((o) => outlierFiles.has(o.source_id));
  const typicalResult = await timed(`typical-half (n=${typicalObs.length})`, () => emergeHolons({ basisId: FOLD_BASIS_ID, observations: typicalObs }));
  const outlierResult = await timed(`outlier-half (n=${outlierObs.length})`, () => emergeHolons({ basisId: FOLD_BASIS_ID, observations: outlierObs }));

  console.log(JSON.stringify({
    totalBooks: files.length,
    totalObservations: allObservations.length,
    naive: naiveSummary,
    naiveContentOnly: naiveContentSummary,
    typicalHalf: { booksUsed: typicalFiles.size, observationsUsed: typicalObs.length, ...summarize(typicalResult.holons) },
    outlierHalf: { booksUsed: outlierFiles.size, observationsUsed: outlierObs.length, ...summarize(outlierResult.holons) },
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
