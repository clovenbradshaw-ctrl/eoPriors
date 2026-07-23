#!/usr/bin/env node
// scripts/build-corpus-prior.mjs — persists the aggregate 27-cell fold
// distribution built from a real corpus as a loadable artifact, instead of
// only printing it to stdout the way run-fold-bridge.mjs and
// crossval-fold-priors.mjs do. This is the "corpus prior" those two scripts
// and reading-improvement-experiment.mjs already compute ad hoc and
// re-derive from raw text on every run — this script is the one that writes
// it down so something else (a future reading.js hook, a downstream script)
// can load it without re-reading the whole corpus.
//
// NOT the exemplar basis (schemas/exemplar-basis.schema.json): that's 100
// hand-selected candidate texts + a human-gated activation event
// (SPEC.md invariant 10, src/basis-select.js). This is a plain aggregate
// distribution over real folds from whatever corpus directory you point it
// at — informal, disposable, safe to regenerate, carries its own provenance
// (which books, how many spans, reader_version) so a consumer can tell
// whether it's stale relative to the corpus that produced it.
//
// Usage:
//   node scripts/build-corpus-prior.mjs --corpus-dir <dir> --out <file.json> [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadReader, readingToFold, READER_VERSION } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize } from './lib/prior-crossval.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64); // config/exemplar-basis/active.json is still null

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    out: get('--out', null),
    maxSentences: Number(get('--max-sentences', 200)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

// Largest-remainder rounding so the ppm values sum to EXACTLY 1_000_000 —
// naive per-cell Math.round can drift a few ppm off in either direction,
// which would violate the "no floats, exact ppm" convention every other
// schema in this repo already holds to (measurement.schema.json's
// ppmInteger doc comment).
function toExactPpm(dist, cellKeys) {
  const raw = cellKeys.map((c) => dist[c] * 1_000_000);
  const floors = raw.map(Math.floor);
  let remainder = 1_000_000 - floors.reduce((s, v) => s + v, 0);
  const order = cellKeys.map((_, i) => i).sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]));
  const ppm = floors.slice();
  for (let i = 0; i < remainder; i++) ppm[order[i]] += 1;
  return Object.fromEntries(cellKeys.map((c, i) => [c, ppm[i]]));
}

async function main() {
  const { corpusDir, out, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir || !out) {
    console.error('usage: build-corpus-prior.mjs --corpus-dir <dir> --out <file.json> [--max-sentences N] [--eoreader-path <path>]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const cellKeys = Object.keys(cellsBundle.cells);

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  const allSpans = [];
  const perBook = [];

  for (const file of files) {
    const raw = readFileSync(`${corpusDir}/${file}`, 'utf8');
    let doc;
    try {
      doc = createParser().parse(stripFrame(raw));
    } catch (e) {
      console.error(`  parse failed on ${file}: ${e.message}`);
      continue;
    }
    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);
    let bookSpans = 0;
    for (let i = start; i < end; i++) {
      const reading = readingAt(doc, i);
      const fold = readingToFold(doc, i, reading);
      const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      const probs = {};
      for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) probs[cell] = m.amplitude_ppm / 1_000_000;
      allSpans.push(probs);
      bookSpans++;
    }
    perBook.push({ file, spans: bookSpans });
    console.error(`  ${file}: ${bookSpans} spans`);
  }

  const dist = normalize(accumulate(allSpans, cellKeys), cellKeys);
  const distributionPpm = toExactPpm(dist, cellKeys);

  const artifact = {
    corpus_prior_version: 'corpus-prior@1.0.0',
    generated_from: {
      corpus_dir_basename: corpusDir.split('/').filter(Boolean).pop(),
      books: perBook.length,
      spans: allSpans.length,
      max_sentences_per_book: maxSentences,
      per_book: perBook,
    },
    reader_version: READER_VERSION,
    fold_basis_id: FOLD_BASIS_ID,
    measurement_protocol: cellsBundle.protocol || 'eo-compression@1.0.0',
    distribution_ppm: distributionPpm,
  };

  writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
  const sum = Object.values(distributionPpm).reduce((s, v) => s + v, 0);
  console.log(`Wrote ${out}: ${perBook.length} books, ${allSpans.length} spans, distribution sums to ${sum} ppm.`);
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
