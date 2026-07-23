#!/usr/bin/env node
// scripts/genre-discrimination-experiment.mjs — does the fold-cell signal
// track something real and interpretable (genre), or is it just abstract
// statistics that happens to generalize? Books' own subject_key is
// unique-per-book in a stratified-sampled corpus (deliberately, to avoid
// clustering on one popular genre) — no same-subject pairs exist to compare
// directly. Fall back to the one OBJECTIVE binary split available straight
// from Gutenberg's own catalog vocabulary: does subject_key contain
// "fiction" or "stories"? Avoids imposing subjective finer-grained genre
// judgments of my own.
//
// Hypothesis: same-category book pairs (Fiction-Fiction or NonFiction-
// NonFiction) should correlate MORE in their content-cell profiles than
// cross-category pairs (Fiction-NonFiction), if the signal tracks genre at
// all. Tested with a permutation test (shuffle the Fiction/NonFiction
// labels, keep group sizes fixed, recompute the gap many times) rather than
// asserting significance from a single observed number.
//
// Run against 55 real Gutenberg books (10 fiction, 45 non-fiction), 2000
// permutations: observed gap +0.121, null mean ~0, p=0.007 — same-category
// pairs correlate significantly more than cross-category pairs.
//
// Usage: node scripts/genre-discrimination-experiment.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--permutations N]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize, restrictAndRenormalize } from './lib/prior-crossval.mjs';
import { pearson, mean } from './lib/stats.mjs';
import { parseManifestCsv } from './lib/manifest-csv.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
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

async function main() {
  const { corpusDir, spansPerBook, maxSentences, permutations, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: genre-discrimination-experiment.mjs --corpus-dir <dir> [--spans-per-book N] [--max-sentences N] [--permutations N]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const contentCellKeys = Object.keys(cellsBundle.cells).filter((c) => !EXCLUDED.includes(c));
  const manifestById = parseManifestCsv(readFileSync(`${corpusDir}/manifest.csv`, 'utf8'));

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, ~${spansPerBook} spans/book, ${permutations} permutations\n`);

  const profile = {};
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
    const probsForBook = [];
    for (let i = start, count = 0; i < end && count < spansPerBook; i += span, count++) {
      const reading = readingAt(doc, i, { terrains: true });
      const fold = readingToFold(doc, i, reading);
      const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      const probs = {};
      for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) probs[cell] = m.amplitude_ppm / 1_000_000;
      probsForBook.push(probs);
    }
    profile[file] = normalize(accumulate(restrictAndRenormalize(probsForBook, contentCellKeys), contentCellKeys), contentCellKeys);
    console.error(`  ${file}: fiction=${isFiction[file]}  subject="${row.subject_key}"`);
  }

  const validFiles = files.filter((f) => profile[f] !== undefined);
  const fictionCount = validFiles.filter((f) => isFiction[f]).length;
  console.error(`\n${validFiles.length} books scored; ${fictionCount} fiction, ${validFiles.length - fictionCount} non-fiction\n`);

  const vec = (f) => contentCellKeys.map((c) => profile[f][c]);
  const allPairs = [];
  for (let i = 0; i < validFiles.length; i++) {
    for (let j = i + 1; j < validFiles.length; j++) {
      allPairs.push({ a: validFiles[i], b: validFiles[j], corr: pearson(vec(validFiles[i]), vec(validFiles[j])) });
    }
  }

  const gapFor = (labels) => {
    const same = [], cross = [];
    for (const { a, b, corr } of allPairs) (labels[a] === labels[b] ? same : cross).push(corr);
    return mean(same) - mean(cross);
  };

  const observedGap = gapFor(isFiction);

  const fictionSet = validFiles.filter((f) => isFiction[f]);
  let countAsExtreme = 0;
  const nullGaps = [];
  for (let p = 0; p < permutations; p++) {
    const shuffledAll = shuffled(validFiles);
    const permLabels = {};
    shuffledAll.forEach((f, idx) => { permLabels[f] = idx < fictionSet.length; });
    const g = gapFor(permLabels);
    nullGaps.push(g);
    if (g >= observedGap) countAsExtreme++;
  }
  const pValue = (countAsExtreme + 1) / (permutations + 1);

  console.log(JSON.stringify({
    totalBooks: validFiles.length,
    fictionCount,
    nonFictionCount: validFiles.length - fictionCount,
    totalPairs: allPairs.length,
    observedGap: +observedGap.toFixed(4),
    nullMeanGap: +mean(nullGaps).toFixed(4),
    permutations,
    pValue: +pValue.toFixed(4),
    interpretation: pValue < 0.05
      ? 'same-category pairs correlate significantly more than cross-category pairs — the signal tracks genre'
      : 'no significant genre discrimination detected at p<0.05',
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
