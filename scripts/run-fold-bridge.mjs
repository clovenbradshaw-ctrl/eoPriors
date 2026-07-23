#!/usr/bin/env node
// scripts/run-fold-bridge.mjs — the fold seam, run for real: reads a
// directory of plain-text files through eoreader4.2's actual reader (via
// src/reader-bridge.js), folds every span, compresses it with src/fold.js,
// and reports the 9-operator / 27-cell distribution. No embeddings, no
// mocks, no synthetic folds.
//
// This is a diagnostic/demonstration tool, not the ingestion pipeline —
// it does not write observation.* events to batches/. Corpus text files are
// never committed to this repo (SPEC.md's ledger holds events and URIs, not
// source blobs); point --corpus-dir at wherever you keep them locally.
//
// Usage:
//   node scripts/run-fold-bridge.mjs --corpus-dir <dir> [--max-books N] [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';

const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64); // config/exemplar-basis/active.json is still null — placeholder for this diagnostic run
const SKIP_FRONT_MATTER = 15; // Gutenberg-style boilerplate/TOC lines are near-uniformly zero-evidence

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
    maxBooks: Number(get('--max-books', 12)),
    maxSentences: Number(get('--max-sentences', 250)),
    eoreaderPath: get('--eoreader-path', undefined),
  };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

async function main() {
  const { corpusDir, maxBooks, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: run-fold-bridge.mjs --corpus-dir <dir> [--max-books N] [--max-sentences N] [--eoreader-path <path>]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).slice(0, maxBooks);
  const cellCounts = Object.fromEntries(Object.keys(cellsBundle.cells).map((c) => [c, 0]));
  const operatorCounts = Object.fromEntries(Object.keys(cellsBundle.operators).map((op) => [op, 0]));
  let totalSpans = 0, heldSpans = 0, evidenceSpans = 0, surprisalSum = 0, bayesSum = 0;
  const perBook = [];

  for (const file of files) {
    const raw = readFileSync(`${corpusDir}/${file}`, 'utf8');
    let doc;
    try {
      doc = createParser().parse(stripFrame(raw));
    } catch (e) {
      console.error(`  skip ${file}: parse failed — ${e.message}`);
      continue;
    }
    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);

    let bookSpans = 0;
    for (let i = start; i < end; i++) {
      const reading = readingAt(doc, i, { terrains: true });
      const fold = readingToFold(doc, i, reading);
      const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      totalSpans++; bookSpans++;
      if (reading.held) heldSpans++;
      surprisalSum += reading.surprisalBits || 0;
      bayesSum += reading.bayesBits || 0;
      if (measurement.diagnostics.total_supported_amplitude > 0) {
        evidenceSpans++;
        for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) {
          if (m.amplitude_ppm <= 0) continue;
          cellCounts[cell]++;
          operatorCounts[cellsBundle.cells[cell].op]++;
        }
      }
    }
    perBook.push({ file, spans: bookSpans, totalSentences: units.length });
    console.error(`  ${file}: ${bookSpans} spans sampled`);
  }

  console.log(JSON.stringify({
    booksProcessed: perBook.length,
    totalSpansSampled: totalSpans,
    heldSpans,
    evidenceSpans,
    meanSurprisalBits: totalSpans ? +(surprisalSum / totalSpans).toFixed(4) : 0,
    meanBayesBits: totalSpans ? +(bayesSum / totalSpans).toFixed(4) : 0,
    operatorCounts,
    cellCounts,
    perBook,
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
