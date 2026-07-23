#!/usr/bin/env node
// scripts/cross-modal-probe.mjs — does the fold reader generalize past
// English public-domain prose? Runs the bridge on each file separately and
// reports its own operator distribution, so source code vs non-English prose
// vs (baseline) English prose can be compared side by side. The question
// isn't "is the signal identical" — it's "does the reader run without error
// and produce a DIFFERENT-but-SENSIBLE fold shape," which is what confirms
// the operator vocabulary is structural rather than English-prose-specific.
//
// Findings from the initial diverse pull (docs/corpus-sources.md §9-11):
//   - Non-English prose (de/es/fr/fi) shows the same high-CON/high-INS
//     profile as English, with real surprisal (1.6-5.1 bits) — the operator
//     vocabulary is genuinely structural, not English-specific.
//   - Source code reads distinctly: lower CON (bonds), higher NUL ("nothing
//     transformed"), much lower surprisal (Rust 0.20b, Flask 0.41b vs prose
//     1.6-5.1b). Partly real (code IS more repetitive) and PARTLY an artifact
//     of segment.js being a PROSE splitter (terminal punctuation + blank
//     lines) mis-segmenting code — the documented first-thing-to-fix for real
//     cross-modal support. Reported honestly, not as pure signal.
//
// Usage: node scripts/cross-modal-probe.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]

import { readFileSync, readdirSync } from 'node:fs';
import { loadReader, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';

const SKIP_FRONT_MATTER = 15;
const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return { corpusDir: get('--corpus-dir', null), maxSentences: Number(get('--max-sentences', 150)), eoreaderPath: get('--eoreader-path', undefined) };
}

const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

async function main() {
  const { corpusDir, maxSentences, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!corpusDir) { console.error('usage: cross-modal-probe.mjs --corpus-dir <dir> [--max-sentences N] [--eoreader-path <path>]'); process.exit(1); }

  const { createParser, readingAt } = await loadReader({ eoreaderPath });
  const cellsBundle = await loadPhasepostCells();
  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort();

  const rows = [];
  for (const file of files) {
    let doc, err = null;
    try { doc = createParser().parse(stripFrame(readFileSync(`${corpusDir}/${file}`, 'utf8'))); }
    catch (e) { err = e.message; }
    if (err) { console.error(`${file}: PARSE ERROR: ${err}`); rows.push({ file, parseError: err }); continue; }

    const units = doc.sentences || doc.units || [];
    const start = Math.min(SKIP_FRONT_MATTER, units.length);
    const end = Math.min(units.length, start + maxSentences);
    const opCount = {};
    let spans = 0, held = 0, surprisalSum = 0;
    for (let i = start; i < end; i++) {
      const reading = readingAt(doc, i, { terrains: true });
      const fold = readingToFold(doc, i, reading);
      const measurement = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
      spans++;
      if (reading.held) held++;
      surprisalSum += reading.surprisalBits || 0;
      for (const [cell, m] of Object.entries(measurement.phasepost_measurements)) {
        if (m.amplitude_ppm <= 0) continue;
        const op = cellsBundle.cells[cell].op;
        opCount[op] = (opCount[op] || 0) + 1;
      }
    }
    const operatorPct = Object.fromEntries(Object.entries(opCount).map(([op, c]) => [op, +(100 * c / spans).toFixed(1)]));
    rows.push({
      file, units: units.length, spans,
      heldPct: +(100 * held / spans).toFixed(1),
      meanSurprisalBits: +(surprisalSum / spans).toFixed(3),
      operatorPct,
    });
    const opStr = Object.entries(operatorPct).sort((a, b) => b[1] - a[1]).map(([op, p]) => `${op}:${p}%`).join(' ');
    console.error(`${file.padEnd(32)} units=${String(units.length).padStart(5)} held=${rows[rows.length - 1].heldPct}% surp=${rows[rows.length - 1].meanSurprisalBits}b  ${opStr}`);
  }

  console.log(JSON.stringify({ corpusDir, maxSentences, rows }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
