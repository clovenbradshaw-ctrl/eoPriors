#!/usr/bin/env node
// scripts/surprise-signal-experiment.mjs — is there a MORE MEANINGFUL surprise
// signal when a span is scored against real corpus priors, rather than
// against just the reader's own intra-document history? Three comparisons,
// unified into one sweep:
//
//   BASELINE       reading.js's own surprisalBits — pure intra-document,
//                   zero external information.
//   (1) all priors  the k=(N-1) endpoint of the sweep below: every OTHER book.
//   (2) correlation the SAME sweep at smaller k: a prior built from just the
//       set              k books whose own content-cell distribution most
//                        correlates with the held-out book's — a targeted,
//                        locally-relevant prior instead of a generic one.
//   (3) how far        depth sweep, independent of k: score at G0 (7 real
//       down the           content cells), G1 ("the shadows of the sites" —
//       divided line        collapse each site's operators together: Entity=
//                           NUL+SIG+INS, Link=SEG+CON+SYN, Lens=DEF), or G2
//                           (collapse everything into one bucket — provably
//                           zero information, the bottom of the line).
//
// "Meaningful" is reported two ways, not asserted: SPREAD (std-dev — does the
// signal vary enough across spans to discriminate anything) and CORRELATION
// WITH THE BASELINE (low = the corpus view is catching something the
// document's own local context doesn't; high = redundant restating).
//
// Leave-one-book-out: every book is held out exactly once, scored against a
// prior built ONLY from the other 54 (or fewer, for smaller k). Book
// correlation ranking is done once per held-out book over the FULL 7-cell
// content space, then the resulting book set is scored at every depth.
//
// Usage:
//   node scripts/surprise-signal-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';
import { accumulate, normalize, restrictAndRenormalize, perSpanSurprise, projectToGroups, siteGroupsOf } from './lib/prior-crossval.mjs';
import { mean, stddev, pearson } from './lib/stats.mjs';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);
const EXCLUDED_FROM_CONTENT_VIEW = ['EVA_Binding_Lens', 'REC_Making_Lens'];
const K_VALUES = [1, 3, 5, 10, 20, null]; // null = all other books

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return {
    corpusDir: get('--corpus-dir', null),
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
    spans.push({ probs, surprisalBits: reading.surprisalBits || 0 });
  }
  return spans;
}

async function main() {
  const { corpusDir, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) {
    console.error('usage: surprise-signal-experiment.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]');
    process.exit(1);
  }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const allCellKeys = Object.keys(cellsBundle.cells);
  const contentCellKeys = allCellKeys.filter((c) => !EXCLUDED_FROM_CONTENT_VIEW.includes(c));
  const siteGroups = siteGroupsOf(cellsBundle, contentCellKeys); // G1: "shadows of the sites"
  const scalarGroup = { ALL: contentCellKeys };                  // G2: bottom of the line

  const DEPTHS = {
    G0_cells: { grouping: Object.fromEntries(contentCellKeys.map((c) => [c, [c]])) },
    G1_sites: { grouping: siteGroups },
    G2_scalar: { grouping: scalarGroup },
  };

  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();
  console.error(`${files.length} books, up to ${maxSentences} sentences/book\n`);

  // Read once, cache: content-only renormalized spans + each book's own
  // aggregate content-cell profile (for correlation ranking).
  const bookSpans = {};   // file -> restrictAndRenormalize'd spans (content-only, G0)
  const bookBaseline = {}; // file -> array of reading.js's own surprisalBits, aligned index-for-index with bookSpans[file]
  const bookProfile = {}; // file -> normalized content-cell vector (for correlation ranking)
  for (const file of files) {
    const raw = await readBookSpans(`${corpusDir}/${file}`, createParser, readingAt, cellsBundle, maxSentences);
    bookSpans[file] = restrictAndRenormalize(raw.map((s) => s.probs), contentCellKeys);
    bookBaseline[file] = raw.map((s) => s.surprisalBits);
    bookProfile[file] = normalize(accumulate(bookSpans[file], contentCellKeys), contentCellKeys);
    console.error(`  read ${file}: ${bookSpans[file].length} spans`);
  }

  const correlationTo = (a, b) => {
    const va = contentCellKeys.map((c) => bookProfile[a][c]);
    const vb = contentCellKeys.map((c) => bookProfile[b][c]);
    return pearson(va, vb);
  };

  // Global, aligned-by-construction arrays: every (k, depth) combination
  // iterates books/spans in the SAME fixed order, so index i always refers
  // to the same span across every array — correlate-with-baseline is valid.
  const globalBaseline = [];
  const globalSignal = {}; // key `${k}|${depth}` -> array, same length/order as globalBaseline
  for (const k of K_VALUES) for (const depth of Object.keys(DEPTHS)) globalSignal[`${k}|${depth}`] = [];

  for (const heldOutFile of files) {
    const heldOutSpansG0 = bookSpans[heldOutFile];
    const heldOutBaseline = bookBaseline[heldOutFile];
    globalBaseline.push(...heldOutBaseline);

    const others = files.filter((f) => f !== heldOutFile);
    const ranked = others.slice().sort((a, b) => correlationTo(heldOutFile, b) - correlationTo(heldOutFile, a));

    for (const k of K_VALUES) {
      const chosen = k === null ? ranked : ranked.slice(0, Math.min(k, ranked.length));
      const priorSpansG0 = chosen.flatMap((f) => bookSpans[f]);

      for (const [depthName, { grouping }] of Object.entries(DEPTHS)) {
        const groupKeys = Object.keys(grouping);
        const heldOutProjected = projectToGroups(heldOutSpansG0, grouping);
        const priorProjected = projectToGroups(priorSpansG0, grouping);
        const Q = normalize(accumulate(priorProjected, groupKeys), groupKeys);
        const perSpan = perSpanSurprise(heldOutProjected, Q, groupKeys);
        globalSignal[`${k}|${depthName}`].push(...perSpan);
      }
    }
    console.error(`  scored ${heldOutFile} against ${K_VALUES.length} k-values x ${Object.keys(DEPTHS).length} depths`);
  }

  const baselineStd = stddev(globalBaseline);
  const results = [];
  for (const k of K_VALUES) {
    for (const depthName of Object.keys(DEPTHS)) {
      const sig = globalSignal[`${k}|${depthName}`];
      results.push({
        k: k === null ? 'all' : k,
        depth: depthName,
        n: sig.length,
        meanBits: +mean(sig).toFixed(4),
        stdBits: +stddev(sig).toFixed(4),
        corrWithBaseline: +pearson(sig, globalBaseline).toFixed(4),
      });
    }
  }

  console.log(JSON.stringify({
    totalBooks: files.length,
    totalSpans: globalBaseline.length,
    baseline: { meanBits: +mean(globalBaseline).toFixed(4), stdBits: +baselineStd.toFixed(4) },
    kValuesSwept: K_VALUES.map((k) => k ?? 'all'),
    depthsSwept: Object.keys(DEPTHS),
    results,
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
