#!/usr/bin/env node
// scripts/dna-fold-probe.mjs — the THIRD modality (maximally different from
// text) through the SAME fold-compression core. FASTA bytes -> eoreader4.2's
// parseFasta -> codonsOf -> ingestCodons (INS per codon, CON to the previous)
// -> the SAME readingAt -> readingToFold -> measureFold. Completes the
// "bytes are bytes, the core is modality-blind" demonstration: text (rich),
// music (INS+CON, recurring pitch classes), DNA (INS+CON, positional).
//
// Expect a nearly-uniform fold profile: the codon organ gives each codon a
// positional id, so every codon is a never-recurring entity bonded to the
// previous — none of the recurrence structure music/text have. That
// uniformity is the honest finding (how the organ models a reading frame),
// not a defect. See reader-bridge.js loadDnaReader's caveat.
//
// Usage: node scripts/dna-fold-probe.mjs --fasta <file.fasta> [--max-spans N] [--frame 0|1|2]

import { readFileSync } from 'node:fs';
import { loadDnaReader, fastaToDoc, readingToFold } from '../src/reader-bridge.js';
import { measureFold, loadPhasepostCells } from '../src/fold.js';

const FOLD_BASIS_ID = 'exemplar-basis:sha256:' + '0'.repeat(64);

function parseArgs(argv) {
  const get = (flag, dflt) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
  return { fasta: get('--fasta', null), maxSpans: Number(get('--max-spans', 300)), frame: Number(get('--frame', 0)), eoreaderPath: get('--eoreader-path', undefined) };
}

async function main() {
  const { fasta, maxSpans, frame, eoreaderPath } = parseArgs(process.argv.slice(2));
  if (!fasta) { console.error('usage: dna-fold-probe.mjs --fasta <file.fasta> [--max-spans N] [--frame 0|1|2]'); process.exit(1); }

  await loadDnaReader({ eoreaderPath }); // surfaces a clear error early if the sibling checkout is missing
  const { doc, codonsParsed } = await fastaToDoc(readFileSync(fasta, 'utf8'), { name: fasta.replace(/^.*\//, ''), frame, eoreaderPath });
  const { readingAt } = await loadDnaReader({ eoreaderPath });
  console.error(`parsed ${codonsParsed} codons (frame ${frame})`);

  const units = doc.units || doc.sentences || [];
  const cellsBundle = await loadPhasepostCells();
  const opCount = {};
  let spans = 0, held = 0, surprisalSum = 0;
  const firstFolds = [];
  const n = Math.min(units.length, maxSpans);
  for (let i = 0; i < n; i++) {
    const reading = readingAt(doc, i);
    const fold = readingToFold(doc, i, reading);
    const m = await measureFold({ fold, cellsBundle, basisId: FOLD_BASIS_ID });
    spans++;
    if (reading.held) held++;
    surprisalSum += reading.surprisalBits || 0;
    for (const [cell, mm] of Object.entries(m.phasepost_measurements)) {
      if (mm.amplitude_ppm <= 0) continue;
      opCount[cellsBundle.cells[cell].op] = (opCount[cellsBundle.cells[cell].op] || 0) + 1;
    }
    if (i < 6) firstFolds.push({ i, unit: units[i], ops: fold.operator_events.map((e) => e.op), surprisalBits: reading.surprisalBits });
  }

  console.log(JSON.stringify({
    source: fasta.replace(/^.*\//, ''),
    modality: doc.modality,
    codonsParsed,
    unitsRead: units.length,
    spansScored: spans,
    heldPct: +(100 * held / spans).toFixed(1),
    meanSurprisalBits: +(surprisalSum / spans).toFixed(3),
    operatorPct: Object.fromEntries(Object.entries(opCount).map(([op, c]) => [op, +(100 * c / spans).toFixed(1)])),
    firstFolds,
  }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
