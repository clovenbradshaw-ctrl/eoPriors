#!/usr/bin/env node
// scripts/grain-coverage-probe.mjs — the definitive answer to "are we really
// making holonic shadows?" Shows the full 27-cell cube lighting up across ALL
// THREE grains, from the two schema-sanctioned sources:
//   - the READER (per span, with { terrains: true }) casts FIGURE + GROUND
//     shadows: Figure = what the span commits, Ground = the standing prior it
//     was read against (the terrains: void/field/atmosphere).
//   - the PROJECTOR (emergence.js, with cellsBundle) casts PATTERN + GROUND
//     shadows: recurring Figure-holons regrained into Pattern-grain cells, and
//     ambient residuals into Ground-grain cells.
// Before this: only 9 Figure cells ever fired. This probe measures how many
// of the 27 now carry real evidence, and from which source.
//
// Usage: node scripts/grain-coverage-probe.mjs --corpus-dir <dir> [--max-books N] [--spans-per-book N]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { emergeHolons } from '../src/emergence.js';

const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const SKIP = 15;

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return { corpusDir: get('--corpus-dir', null), maxBooks: Number(get('--max-books', 12)), spansPerBook: Number(get('--spans-per-book', 5)), eoreaderPath: get('--eoreader-path', undefined) };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

async function main() {
  const { corpusDir, maxBooks, spansPerBook, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) { console.error('usage: grain-coverage-probe.mjs --corpus-dir <dir> [--max-books N] [--spans-per-book N]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const cellKeys = Object.keys(cellsBundle.cells);
  const grainOf = (cell) => cellsBundle.cells[cell].grain;

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort().slice(0, maxBooks);

  // READER side: per-span folds WITH terrains -> Figure + Ground cells.
  const readerCellSpans = Object.fromEntries(cellKeys.map((c) => [c, 0]));
  let spans = 0;
  const observations = [];
  for (const f of files) {
    const doc = createParser().parse(stripFrame(readFileSync(`${corpusDir}/${f}`, 'utf8')));
    const units = (doc.units || doc.sentences || []);
    const start = Math.min(SKIP, units.length);
    let taken = 0;
    for (let i = start; i < units.length && taken < spansPerBook * 20; i++) {
      const reading = readingAt(doc, i, { terrains: true });   // <-- the terrains flag
      const fold = readingToFold(doc, i, reading);
      const m = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      spans++; taken++;
      for (const [cell, mm] of Object.entries(m.phasepost_measurements)) if (mm.amplitude_ppm > 0) readerCellSpans[cell]++;
      // keep a subset as emergence observations (positional, cross-source)
      if (taken <= spansPerBook) observations.push({ observation_id: `${f}:${i}`, source_id: f, phasepost_measurements: m.phasepost_measurements });
    }
  }

  // PROJECTOR side: emergence WITH cellsBundle -> Pattern + Ground grain holons.
  const { holons } = await emergeHolons({ basisId: FOLD_BASIS_ID, observations, cellsBundle });
  const holonCellsByGrain = { Figure: new Set(), Pattern: new Set(), Ground: new Set() };
  const holonTierCounts = { Figure: 0, Pattern: 0, Ground: 0 };
  for (const h of holons) {
    holonTierCounts[h.grain]++;
    for (const [cell, p] of Object.entries(h.prototype)) if (p > 0) holonCellsByGrain[grainOf(cell)].add(cell);
  }

  const readerCellsByGrain = { Figure: [], Pattern: [], Ground: [] };
  for (const cell of cellKeys) if (readerCellSpans[cell] > 0) readerCellsByGrain[grainOf(cell)].push(cell);

  const unionCovered = new Set([
    ...readerCellsByGrain.Figure, ...readerCellsByGrain.Ground,
    ...holonCellsByGrain.Pattern, ...holonCellsByGrain.Ground,
  ]);

  console.log(JSON.stringify({
    booksRead: files.length,
    spansScored: spans,
    emergenceObservations: observations.length,
    readerGrainCoverage: {
      Figure: readerCellsByGrain.Figure,
      Ground: readerCellsByGrain.Ground,           // the TERRAINS, now firing
      Pattern: readerCellsByGrain.Pattern,          // still empty from the reader, by design
    },
    projectorGrainCoverage: {
      holonTierCounts,
      PatternCells: [...holonCellsByGrain.Pattern],  // recurring holons regrained to Pattern
      GroundCells: [...holonCellsByGrain.Ground],
      FigureCells: [...holonCellsByGrain.Figure],
    },
    cubeCellsCovered: `${unionCovered.size} / 27`,
    grainsLit: ['Figure', 'Ground', 'Pattern'].filter((g) =>
      readerCellsByGrain[g].length > 0 || holonCellsByGrain[g].size > 0),
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
